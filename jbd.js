const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter')
const logger = require('./logger');
const cli = require('./cli');
const args = cli.args;

const START_BYTE = 0xDD;
const STOP_BYTE = 0x77;
const READ_BYTE = 0xA5;
const READ_LENGTH = 0x00;

const port = new SerialPort(args.serialport, {
    baudRate: args.baudrate
});

const register0x03 = {
    setData: function(rawData) { 
        //pos 4/5 Pack Voltage 
        this.packV = parseFloat(process2Byte(rawData[4], rawData[5], 0.01));
        //pos 6/7 - Pack Current, positive for chg, neg for discharge
        this.packA = parseFloat(process2Byte(rawData[6], rawData[7], 0.01));
        //pos 8/9 - Pack Balance Capacity
        this.packBalCap = parseFloat(process2Byte(rawData[8], rawData[9], 0.01));
        //pos 10/11 - Pack Rate Capacity
        this.packRateCap = parseFloat(process2Byte(rawData[10], rawData[11], 0.01));
        //pos 12/13 - Pack number of cycles
        this.packCycles = parseInt(process2Byte(rawData[12], rawData[13]));
        //pos 14/15 bms production date
            //TODO
        //pos 25 battery series number - do this before balance status so we can use it to return the correct size array
        this.packNumberOfCells = parseInt(process1Byte(rawData[25]));
        //pos 16/17 balance status
        this.balanceStatus = getBalanceStatus(rawData[16], rawData[17], this.packNumberOfCells);
        //pos 18/19 balance status high
        this.balanceStatusHigh = getBalanceStatus(rawData[18], rawData[19], this.packNumberOfCells);
        //pos 20/21 protection status
        this.protectionStatus = getProtectionStatus(rawData[20],rawData[21]);
        //pos 22 s/w version
        this.bmsSWVersion = rawData[22];
        //pos 23 RSOC (remaining pack capacity, percent)
        this.packSOC = parseInt(process1Byte(rawData[23]));
        //pos 24 FET status, bit0 chg, bit1, dischg (0 FET off, 1 FET on)
            //TODO
        //pos 26 number of temp sensors (NTCs)
        this.tempSensorCount = parseInt(process1Byte(rawData[26]));
        //pos 27 / 28 / 29 Temp sensor (NTC) values
            //TODO
        return this;
    }
};

const register0x04 = {
    setData: function(rawData) {
        this.cell1 = 0;
        const cellData = rawData.slice(3,rawData.length-3);
        console.log(cellData);
        return this;
    }
};

function readRegisterPayload(register) {
    const result = Buffer.alloc(7);
    //Start Byte
    result[0] = START_BYTE;
    //Request type: 0xA5 read, 0x5A write
    result[1] = READ_BYTE;
    //Register to use
    result[2] = register;
    //Data length, 0 for reads
    result[3] = READ_LENGTH;
    //Checksum: 0x10000 subtract the sum of register and length, U16, 2bytes.
    const chk = calcChecksum(register, result[3]);
    result[4] =chk[0];
    result[5] =chk[1];
    //Stop Byte
    result[6] = STOP_BYTE;
    return result;
}

function calcChecksum(sumOfData, length) {
    const checksum = Buffer.alloc(2)
    //Checksum is 0x10000 (65536 dec) minus the sum of the data plus its length, returned as a 2 byte array
    checksum.writeUInt16BE(0x10000-(sumOfData+length));
    return checksum;
}

function validateChecksum(result) {
    //Payload is between the 4th and n-3th byte (last 3 bytes are checksum and stop byte)
    const sumOfPayload = result.slice(4, result.length-3).reduce((partial_sum, a) => partial_sum + a, 0);
    const checksum = calcChecksum(sumOfPayload, result[3]);
    return checksum[0] === result[result.length-3] && checksum[1] === result[result.length-2];
}

function process2Byte(byte1, byte2, multiplier) {
    multiplier = multiplier != undefined || multiplier != null ? multiplier : 0;
    return (parseInt(`${byte1.toString(16)}${byte2.toString(16)}`, 16) * multiplier).toFixed(2);
}

function process1Byte(byte) {
    return parseInt(byte.toString(16), 16).toFixed(2);
}

function process2BytesToBin(byte1, byte2) {
    return (parseInt(`${byte1.toString(16)}${byte2.toString(16)}`, 16).toString(2)).padStart(16, '0');
}

function getBalanceStatus(byte1,byte2, numCells) {
    const balanceBits = process2BytesToBin(byte1, byte2).split("").slice(0, numCells);
    return balanceBits.map((bit, idx) =>{
        const keyName = `cell${idx}`;
        return {[keyName]: Boolean(parseInt(bit))};
    });
}

function getProtectionStatus(byte1, byte2) {
    const protectionBits = process2BytesToBin(byte1, byte2).split("").map(pb => {
        pb = Boolean(parseInt(pb));
        return pb;
    });

    //Bit definitions
    const protectionStatus = {    
        //bit0 - Single Cell overvolt
        singleCellOvervolt: protectionBits[0],
        //bit1 - Single Cell undervolt
        singleCellUndervolt:protectionBits[1],
        //bit2 - whole pack overvolt
        packOvervolt:protectionBits[2],
        //bit3 - whole pack undervolt
        packUndervolt:protectionBits[3],
        //bit4 - charging over temp
        chargeOvertemp:protectionBits[4],
        //bit5 - charging under temp
        chargeUndertemp:protectionBits[5],
        //bit6 - discharge over temp
        dischargeOvertemp:protectionBits[6],
        //bit7 - discharge under temp
        dischargeUndertemp:protectionBits[7],
        //bit8 - charge overcurrent
        chargeOvercurrent:protectionBits[8],
        //bit9 - discharge overcurrent   
        dischargeOvercurrent:protectionBits[9],
        //bit10 - short circut
        shortCircut:protectionBits[10],
        //bit11 - front-end detection ic error
        frontEndDetectionICError:protectionBits[11],
        //bit12 - software lock MOS
        softwareLockMOS:protectionBits[12]
        //bit13-15 reserved/unused
    }
    return protectionStatus;
}

async function requestData(serialPort, buff, parser){
    
    logger.trace('Writing to serial port...');
    
    return new Promise(function(resolve, reject) { 
        serialPort.write(buff, function (err) {
        if(err) {
            reject(err);
        }
        logger.trace(buff.map(b => {return b.toString(16)}), 'Data written (HEX): ');
        parser.on('data', (data) => { 
            resolve(data)
        })
      })
    });      
}

module.exports = { 
    getRegister: async function(reg) {
        try {
            logger.trace(`Getting data from Register ${reg}`);
            const parser = port.pipe(new Delimiter({ delimiter: Buffer.alloc(1, STOP_BYTE), includeDelimiter: true }));
            const rawData = await requestData(port, readRegisterPayload(reg), parser);
            logger.trace(rawData.map(b => {return b.toString(16)}), 'Data read (HEX): ');
            if(validateChecksum(rawData)) {
                switch(reg) {
                    case 0x03:
                        return register0x03.setData(rawData);
                    case 0x04:
                        return register0x04.setData(rawData);
                  }
            }
            throw 'Recieved invalid payload from BMS!';
        }
        catch(e) {
            logger.error(e);
        }
    }
};

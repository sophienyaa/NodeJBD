const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter')
const logger = require('./logger');
const cli = require('./cli');
const mqtt = require('./mqtt');
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
        //pos 4/5 Pack Voltage in 10mv, convert to V
        this.packV = bytesToFloat(rawData[4], rawData[5], 0.01);
        //pos 6/7 - Pack Current, positive for chg, neg for discharge, in 10ma, convert to A
        this.packA = bytesToFloat(rawData[6], rawData[7], 0.01, true);
        //pos 8/9 - Pack Balance Capacity, in 10mah convert to Ah
        this.packBalCap = bytesToFloat(rawData[8], rawData[9], 0.01);
        //pos 10/11 - Pack Rate Capacity, in 10mah, convert to Ah
        this.packRateCap = bytesToFloat(rawData[10], rawData[11], 0.01);
        //pos 12/13 - Pack number of cycles
        this.packCycles = toU16(rawData[12], rawData[13]);
        //pos 14/15 bms production date
            //TODO
        //pos 25 battery series number - do this before balance status so we can use it to return the correct size array
        this.packNumberOfCells = toU8(rawData[25]);
        //pos 16/17 balance status
        this.balanceStatus = getBalanceStatus(rawData[16], rawData[17], this.packNumberOfCells);
        //pos 18/19 balance status high
        this.balanceStatusHigh = getBalanceStatus(rawData[18], rawData[19], this.packNumberOfCells);
        //pos 20/21 protection status
        this.protectionStatus = getProtectionStatus(rawData[20],rawData[21]);
        //pos 22 s/w version
        this.bmsSWVersion = rawData[22];
        //pos 23 RSOC (remaining pack capacity, percent)
        this.packSOC = toU8(rawData[23]);
        //pos 24 FET status, bit0 chg, bit1, dischg (0 FET off, 1 FET on)
            //TODO
        //pos 26 number of temp sensors (NTCs)
        this.tempSensorCount = toU8(rawData[26]);
        //pos 27 / 28 / 29 Temp sensor (NTC) values
        this.tempSensorValues = getNTCValues(rawData, this.tempSensorCount);
            //TODO
        return this;
    }
};

const register0x04 = {
    setData: function(rawData) {
        const cellData = rawData.slice(4,rawData.length-3);
        let count = 0;
        for(var i = 0; i < rawData[3]; i++) { 
            if(i == 0 || i % 2 == 0) {
                const cellmV = `cell${count}mV`;
                const cellV = `cell${count}V`;
                this[cellmV] = toU16(cellData[i], cellData[i+1]);
                this[cellV] = bytesToFloat(cellData[i], cellData[i+1], 0.001);
                count++;
            }
        }
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

//calculates the checksum for a request/result
function calcChecksum(sumOfData, length) {
    const checksum = Buffer.alloc(2)
    //Checksum is 0x10000 (65536 dec) minus the sum of the data plus its length, returned as a 2 byte array
    checksum.writeUInt16BE(0x10000-(sumOfData+length));
    return checksum;
}

//validates the checksum of an incoming result
function validateChecksum(result) {
    //Payload is between the 4th and n-3th byte (last 3 bytes are checksum and stop byte)
    const sumOfPayload = result.slice(4, result.length-3).reduce((partial_sum, a) => partial_sum + a, 0);
    const checksum = calcChecksum(sumOfPayload, result[3]);
    return checksum[0] === result[result.length-3] && checksum[1] === result[result.length-2];
}

//returns a float to two decimal points for a signed/unsigned int and a multiplier
function bytesToFloat(byte1, byte2, multiplier, signed) {
    multiplier = multiplier === undefined || multiplier === null ? 1 : multiplier;
    if(signed) {
        return parseFloat(toS16(byte1, byte2) * multiplier).toFixed(2);
    }
    return parseFloat(toU16(byte1, byte2) * multiplier).toFixed(2);
}

//takes two bytes and returns 16bit signed int (-32768 to +32767)
function toS16(byte1, byte2) {
    return Buffer.from([byte1, byte2]).readInt16BE();
}

//takes two bytes and returns 16 bit unsigned int (0 to 65535)
function toU16(byte1, byte2) {
    return Buffer.from([byte1, byte2]).readUInt16BE();
}

//takes one byte and returns 8 bit int (0 to 255)
function toU8(byte) {
    return Buffer.from([byte]).readInt8();
}

function process2BytesToBin(byte1, byte2) {
    return toU16(byte1, byte2).toString(2).padStart(16, '0');
}

function getBalanceStatus(byte1, byte2, numCells) {
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

function getNTCValues(bytes, numNTCs) {
    let count = 0;
    let result = {};
    for(var i = 27; i < 27+(numNTCs*2); i++) { 
        if(i == 27 || i % 2 != 0) {
            const ntcName = `NTC${count}`;
            //temp is in 0.1K convert to celcius
            result[ntcName] = (bytesToFloat(bytes[i], bytes[i+1], 0.1) - 273.15).toFixed(2);
            count++;
        }
    }
    return result;
}

async function requestData(serialPort, buff, parser){
    
    logger.trace('Requesting data from BMS...');
    return new Promise(function(resolve, reject) { 
        serialPort.write(buff, function (err) {
        if(err) {
            reject(err);
        }
        logger.trace(buff.map(b => {return b.toString(16)}), 'Request sent (HEX): ');
       resolve();
      })
    });      
}

const parser = port.pipe(new Delimiter({ delimiter: Buffer.alloc(1, STOP_BYTE), includeDelimiter: true }));
parser.on('data', function (data) {
    logger.trace(data, 'Recieved Data from BMS (HEX): ');
    if(validateChecksum(rawData)) {
        logger.trace('Data from is valid!');
        switch(rawData[1]) {
            case 0x03:
                const register3 = register0x03.setData(rawData);
                if(args.mqttbroker) { 
                    logger.trace(register3, 'Register 3 Data: ');
                    mqtt.publish(register3, 'pack');
                }
                console.log(register3);
                break;
            case 0x04:
                const register4 = register0x04.setData(rawData);
                if(args.mqttbroker) { 
                    logger.trace(register4, 'Register 4 Data: ');
                    mqtt.publish(register4, 'cells');
                }
                console.log(register4);
                break;
          }
    }
    logger.error('Recieved invalid data from BMS!');
    }
);

module.exports = { 
    getRegister: async function(reg) {
        try {
            logger.trace(`Getting data from Register ${reg}`);
            await requestData(port, readRegisterPayload(reg), parser);
        }
        catch(e) {
            logger.error(e);
        }
    }
};

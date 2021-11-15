const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter')
const logger = require('./logger');
const cli = require('./cli');
const args = cli.args;

const START_BYTE = 0xDD;
const STOP_BYTE = 0x77;
const READ_BYTE = 0xA5;
const READ_LENGTH = 0x00;

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


const example0x03 = Buffer.alloc(36);
//start byte
example0x03[0] = 0xDD
//request made
example0x03[1] = 0x03 
//status 0 = OK
example0x03[2] = 0x00 
//length
example0x03[3] = 0x1D //=29 bytes
//DATA
//packv
example0x03[4] = 0x05 //1
example0x03[5] = 0x45 //2

//pack ma
example0x03[6] = 0x01 //3
example0x03[7] = 0x79 //4


example0x03[8] = 0x26 //5
example0x03[9] = 0x6b //6

example0x03[10] = 0x27 //7
example0x03[11] = 0x10 //8

example0x03[12] = 0x00 //9
example0x03[13] = 0x00 //10

example0x03[14] = 0x2b //11
example0x03[15] = 0x1c //12

example0x03[16] = 0x00 //13
example0x03[17] = 0x00 //14

example0x03[18] = 0x00 //15
example0x03[19] = 0x00 //16

example0x03[20] = 0x00 //17
example0x03[21] = 0x00 //18

example0x03[22] = 0x20 //19

example0x03[23] = 0x62 //20

example0x03[24] = 0x03 //21

example0x03[25] = 0x04 //22
example0x03[26] = 0x03 //23
example0x03[27] = 0x0b //24
example0x03[28] = 0x1d //25
example0x03[29] = 0x0b //26
example0x03[30] = 0x1e //27
example0x03[31] = 0x0b //28
example0x03[32] = 0x18 //29
//Checksum = 64784 ... 752
example0x03[33] = 0xfd 
example0x03[34] = 0x10
//Stop Byte
example0x03[35] = 0x77

const register0x03 = {
    setData: function(rawData) { 
        //pos 4/5 Pack Voltage 
        this.packV = process2Byte(rawData[4], rawData[5], 0.01);
        //pos 6/7 - Pack Current, positive for chg, neg for discharge
        this.packA = process2Byte(rawData[6], rawData[7], 0.01);
        //pos 8/9 - Pack Balance Capacity
        this.packBalCap = process2Byte(rawData[8], rawData[9], 0.01);
        //pos 10/11 - Pack Rate Capacity
        this.packRateCap = process2Byte(rawData[10], rawData[11], 0.01);
        //pos 12/13 - Pack number of cycles
        this.packCycles = process2Byte(rawData[12], rawData[13]);
        //TODO: pos 14/15 bms production date
        
        //pos 25 battery series number - do this before balance status so we can use it
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
        this.packSOC = process1Byte(rawData[23]);
        //TODO: pos 24 FET status, bit0 chg, bit1, dischg (0 FET off, 1 FET on)

        //pos 26 number of temp sensors (NTCs)
        this.tempSensorCount = parseInt(process1Byte(rawData[26]));
        //TODO: pos 27 / 28 / 29 Temp sensor (NTC) values
        
        return this;
    }
};

const port = new SerialPort(args.serialport, {
    baudRate: args.baudrate
});

module.exports = { 

    getRegister3: async function() {
        try {
            const parser = port.pipe(new Delimiter({ delimiter: Buffer.alloc(1, STOP_BYTE) }));
            const rawData = await requestData(port, readRegisterPayload(0x03), parser);
            console.log('parsed' + rawData);
            return register0x03.setData(rawData);
        }
        catch(e) {
            logger.error(e);
        }
    }
};


async function requestData(serialPort, buff, parser){
    
    logger.trace('Writing to serial port...');
    
    return new Promise(function(resolve, reject) { 
        serialPort.write(buff, function (err) {
        if(err) {
            reject(err);
        }
        logger.trace(buff, 'Data written: ');
        parser.on('data', (data) => { 
            resolve(data)
        })
      })
    });      
}

/*

const port = new SerialPort(args.serialport, {
    baudRate: args.baudrate,
    databits: 8,
    parity: 'none'
}, function (err) {
    if (err) {
      return console.log('Error: ', err.message)
    }
  });

  
  port.write(readRegisterPayload(0x03), function(err, res) {
    if (err) {
      return console.log('Error on write: ', err.message)
    }
    console.log('message written')
    console.log(res);
  })

  port.on('readable', function () {
    console.log('Data:', port.read())
  })
*/

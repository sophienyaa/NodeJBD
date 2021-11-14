const SerialPort = require('serialport');
const logger = require('./logger');
const cli = require('./cli');
const args = cli.args;

function readRegisterPayload(register) {
    const result = Buffer.alloc(7);
    //Start Byte
    result[0] = 0xDD;
    //Request type: 0xA5 read, 0x5A write
    result[1] = 0xA5
    //Register to use
    result[2] = register;
    //Data length, 0 for reads
    result[3] = 0x00;
    //Checksum: 0x10000 subtract the sum of register and length, U16, 2bytes.
    const chk = calcReadPayloadChecksum(register, result[3]);
    result[4] =chk[0];
    result[5] =chk[1];
    //Stop Byte
    result[6] = 0x77;
    return result;
}

function calcChecksum(data, length) {
    const checksum = Buffer.alloc(2)
    checksum.writeUInt16BE(0x10000-(data+length));
    return checksum;
}

function validateChecksum(result) {
    //Payload is between the 4th and n-3th byte (last 3 bytes are checksum and stop byte)
    const sumOfPayload = result.slice(4, result.length-3).reduce((partial_sum, a) => partial_sum + a, 0);
    const checksum = calcChecksum(sumOfPayload, result[3]);
    return checksum[0] === result[result.length-3] && checksum[1] === result[result.length-2];
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
example0x03[4] = 0x05 //1
example0x03[5] = 0x45 //2
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

console.log(validateChecksum(example0x03));


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

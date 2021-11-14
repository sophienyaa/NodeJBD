const SerialPort = require('serialport');
const logger = require('./logger');
const cli = require('./cli');
const args = cli.args;

const request0x03 = Buffer.alloc(7);
request0x03[0] = 0xDD;
request0x03[1] = 0xA5;
request0x03[2] = 0x03;
request0x03[3] = 0x00;
request0x03[4] = 0xFF;
request0x03[5] = 0xFD;
request0x03[6] = 0x77;

function readRegisterPayload(register) {
    const result = Buffer.alloc(7);
    //Start Bit
    result[0] = 0xDD;
    //Request type: 0xA5 read, 0x5A write
    result[1] = 0xA5
    //Register to use
    result[2] = register;
    //Data length, 0 for reads
    result[3] = 0x00;
    //Checksum: 0x10000 subtract the sum of register and length, U16, 2bytes.
    const chk = calcChecksum(register, result[3]);
    result[4] =chk[0];
    result[5] =chk[1];
    //Stop Bit
    result[6] = 0x77;
    return result;
}

function calcChecksum(register, length) {
    const checksum = Buffer.alloc(2)
    checksum.writeUInt16BE(0x10000-(register+length));
    return checksum;
}


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


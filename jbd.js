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

function generateRequest(register) {

    console.log(register);

    const result = buffer.alloc(7);

    return result;
}


const port = new SerialPort(args.serialport, {
    baudRate: 9600,
    databits: 8,
    parity: 'none'
}, function (err) {
    if (err) {
      return console.log('Error: ', err.message)
    }
  });

  
  port.write(request0x03, function(err, res) {
    if (err) {
      return console.log('Error on write: ', err.message)
    }
    console.log('message written')
    console.log(res);
  })

  port.on('readable', function () {
    console.log('Data:', port.read())
  })
  
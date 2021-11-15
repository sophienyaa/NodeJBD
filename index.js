#!/usr/bin/env node
const cli = require('./cli');
const mqtt = require('./mqtt');
const jbd = require('./jbd');
const logger = require('./logger');

async function main() {

  logger.info('Starting NodeJBD...');
  try {

    const args = cli.args;
    logger.trace(args, 'With arguments...')

    setInterval(
      async function() {
          const register3 = await jbd.getRegister(0x03);
          const register4 = await jbd.getRegister(0x04);

          if(args.mqttbroker) {
              await mqtt.publish(register3, 'pack');
              //await mqtt.publish(register4, 'cells');
          }
          else {
              logger.trace('No MQTT broker specified!');
              console.log(result);
          }
      }, 
      args.pollinginterval * 1000
    );
  }
  catch(e) {
    logger.error(e);
    process.exit(1);
  }

}

main();

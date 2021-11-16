#!/usr/bin/env node
const cli = require('./cli');
const jbd = require('./jbd');
const logger = require('./logger');

async function main() {

  logger.info('Starting NodeJBD...');
  try {

    const args = cli.args;
    logger.trace(args, 'With arguments...')

    setInterval(
      async function() {
        //send requests, response handled by eventlistener
          await jbd.getRegister(0x03);
          await jbd.getRegister(0x04);
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

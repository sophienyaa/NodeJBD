# NodeJBD

Utility to retrieve data from JBD/Overkill Solar BMS units and publish it to MQTT, written in NodeJS, Based on [NodeRenogy](https://github.com/sophienyaa/NodeRenogy).

Data can then be surfaced in Home Assistant, or anything else that can read from a MQTT bus.

**NOTE:** This software provides *read-only* access to your BMS, intended for publshing information to Home Assistant, Grafana, or similar. You can not change any BMS parameters with this software.

This software is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Thanks

Eric Poulsen for his [bms-tools](https://gitlab.com/bms-tools/bms-tools/-/tree/master) and [documation](https://gitlab.com/bms-tools/bms-tools/-/blob/master/JBD_REGISTER_MAP.md).

Overkill Solar for their [extensive docuentation](https://overkillsolar.com/support-downloads/) and [Arduino library](https://github.com/FurTrader/Overkill-Solar-BMS-Arduino-Library)

## Compatibility

See below table, in theory this should work with any size JBD/Overkill Solar BMS solar, but the below have been tested.
If you have success with one not listed here, please let me know by raising an issue!

|BMS Model|Interface|Notes|Status|
|----------|---------|-----|------|
|JBD SP04S28A4S|UART|100A 4s LiFePO4 BMS|✅|

## Supported Registers

**TODO:** For now, check out Eric Poulsen's documenation [here](https://gitlab.com/bms-tools/bms-tools/-/blob/master/JBD_REGISTER_MAP.md)

## Connecting your BMS

The BMS has a UART port, this is a 5v TTL serial connection and can easily be connected to most machines either via a USB > UART adapter

If you are using a Raspberry Pi or similar, you may be able to connect to the UART pins on the board however you will likely need a logic level converter.

I am using a CP2102 based USB > UART adapter for my application.

You will need to connect TX, RX and GND to your device in order for it to work.

**NOTE:** The UART port has 4 pins, GND, TX, RX and VCC. I have seen reports of VCC putting out ~10v so I would **NOT** connect anything to VCC (or at least test it first!)

**TODO:** Add diagram/photos of UART connection.

## Using the utility

Ideally you would install/run this on a device that is connected to your BMS all the time. I use a Raspberry Pi Zero W, which is more than powerful enough for this use case. 

This also assumes you have a MQTT broker setup and running already. If you don't want to use MQTT you can output the results to the console. Support for other output methods may come at a later date.

You will first need to ensure you have NodeJS v16+ installed on your device.

**NOTE**: If you installed a version of node with `apt-get` on your Pi Zero, please un-install it before installing Node v16.

The Pi Zero/One doesn't have official support for newer version of NodeJS, so follow the instructions [here](https://hassancorrigan.com/blog/install-nodejs-on-a-raspberry-pi-zero/) to get it installed.

If you are using a Pi 2 or later, follow the instructions [here](https://lindevs.com/install-node-js-and-npm-on-raspberry-pi/) to install the official NodeSource build.

Once you've got NodeJS installed, then follow the below instructions.

### Installation

1. Clone this repository (or download it) by running;

`git clone https://github.com/sophienyaa/NodeJBD.git`

2. Change to the `NodeJBD` directory and install the dependencies by running the below commands

 - Change to the directory you cloned the code into: `cd NodeJBD`
 - Run installer: `npm install` 
 - Link command: `sudo npm link`

### Running the utility

Basic Example:

`node-jbd -s /dev/ttyUSB0 -m 192.168.0.10`

This would use serial port `/dev/ttyUSB0` and connect to MQTT Broker at `192.168.0.10` with no user/password, publishing to the `NodeJBD/pack` and `NodeJBD/cells` topics every 10s.

The utility supports using different polling intervals and topics, as well as MQTT brokers that need authentication, please see below for a full list of options.

These options can also be passed as environment variables, by appending `NODEJBD_` to the argument (e.g. `NODEJBD_SERIALPORT=/dev/ttyUSB0`). This is useful when running as a service (see below section).

|Argument |Alias |Env Var|Description | Example |
|---------|------|----------|-----|----|
|--serialport|-s|NODEJBD_SERIALPORT|REQUIRED: Serial port your BMS is connected to|-s /dev/ttyUSB0|
|--baudrate|-b|NODEJBD_BAUDRATE|The baud rate to use for serial communications, defaults to 9600|-b 14400|
|--mqttbroker|-m|NODEJBD_MQTTBROKER|The address of your MQTT Broker|-m 192.168.0.10|
|--mqttuser|-u|NODEJBD_MQTTUSER|The username for your MQTT Broker|-u mqttUser|
|--mqttpass|-p|NODEJBD_MQTTPASS|The password for your MQTT Broker|-p mqttPass| 
|--mqtttopic|-t|NODEJBD_MQTTTOPIC|MQTT topic to publish to defaults to 'NodeJBD'|-t MyTopic|
|--pollinginterval|-i|NODEJBD_POLLINGINTERVAL|How frequently to poll the controller in seconds, defaults to 10|-i 60|
|--loglevel|-l|NODEJBD_LOGLEVEL|Sets the logging level, useful for debugging|-l trace|   
|--help|-h||Show help ||
|--version|||Show version number|  |    

### Running as a service

The utility can be configured to run as a service, including on startup.

These instructions are for Rasbpbian, but should work on any Debian based distro (Ubuntu, etc) or any system that uses systemd.

1. Create a service definition file. This file should contain your required environment variables.

Example:
```
[Unit]
Description=NodeJBD Service

[Service]
ExecStart=node-jbd
Restart=always
User=pi
Group=pi
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
Environment=NODEJBD_SERIALPORT=/dev/ttyUSB0
Environment=NODEJBD_MQTTBROKER=192.168.0.10
WorkingDirectory=/home/pi/NodeJBD

[Install]
WantedBy=multi-user.target
```
Note the `Environment=...` lines, set any configuration options here such as serial port, MQTT broker, interval, etc.

2. Name this file `nodejbd.service` and save it in `/etc/systemd/system`

3. Run the following commands:

 - To start the service: `systemctl start nodejbd`

 - To check the logs/ensure its running: `journalctl -u nodejbd`

 - To enable the service to run at startup: `systemctl enable nodejbd`

## Publishing to MQTT

The utility will publish one topic, with two subtopics on your MQTT Broker. You specify the topic name in the configuration with the default being `NodeJBD`

The first subtopic is `<topic>/pack`. This is published at the set interval and contains all the information about your pack. This contains the data from Register 0x03

Example:
```json
{
	"packV": "13.30",
	"packA": "-0.43",
	"packBalCap": "96.04",
	"packRateCap": "100.00",
	"packCycles": 0,
	"packNumberOfCells": 4,
	"balanceStatus": [{
		"cell0": false
	}, {
		"cell1": false
	}, {
		"cell2": false
	}, {
		"cell3": false
	}],
	"balanceStatusHigh": [{
		"cell0": false
	}, {
		"cell1": false
	}, {
		"cell2": false
	}, {
		"cell3": false
	}],
	"protectionStatus": {
		"singleCellOvervolt": false,
		"singleCellUndervolt": false,
		"packOvervolt": false,
		"packUndervolt": false,
		"chargeOvertemp": false,
		"chargeUndertemp": false,
		"dischargeOvertemp": false,
		"dischargeUndertemp": false,
		"chargeOvercurrent": false,
		"dischargeOvercurrent": false,
		"shortCircut": false,
		"frontEndDetectionICError": false,
		"softwareLockMOS": false
	},
	"bmsSWVersion": 32,
	"packSOC": 96,
	"FETStatus": {
		"charging": true,
		"discharging": true
	},
	"tempSensorCount": 3,
	"tempSensorValues": {
		"NTC0": "12.85",
		"NTC1": "13.95",
		"NTC2": "13.55"
	}
}
```

The second is `<topic>/cells` This is published at the set interval and contains the voltages of your individual cells. This contains the data from register 0x04

Example:
```json
{
    "cell0mV":3324,
    "cell0V":3.32,
    "cell1mV":3325,
    "cell1V":3.33,
    "cell2mV":3324,
    "cell2V":3.32,
    "cell3mV":3325,
    "cell3V":3.33
}
```
You can then subscribe the topics with a MQTT client and data as you wish. An example of this would be surfacing it in Home Assistant. See below for more information on how to do that.

## Getting data into Home Assistant

The values can be displayed in Home Assistant by adding them as [sensors](https://www.home-assistant.io/integrations/sensor.mqtt/) in the `configuration.yaml` files. 

Essentially you just need to extract the values from the JSON payload published to MQTT. For each value you want to use in Home Assistant, add a MQTT sensor entry in your config file.

See below for some examples:

```yaml
sensor:
- platform: mqtt
    name: "Current Battery State of Charge"
    state_topic: "NodeJBD/pack"
    value_template: "{{ value_json['packSOC'] }}"
    unit_of_measurement: "%"
    device_class: battery

- platform: mqtt
    name: "Cell0 Voltage"
    state_topic: "NodeJBD/cells"
    value_template: "{{ value_json['battV'] }}"
    unit_of_measurement: "V"
    device_class: battery
```

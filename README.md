# homebridge-dyson-fan

A [Homebridge](https://github.com/nfarina/homebridge) plugin for controlling a Dyson fan.
This has been tested with and works using the [Dyson Pure Cool Link™ Tower](http://www.dyson.com.au/fans-and-heaters/purifiers/dyson-pure-cool-link.aspx), but may also work with other Dyson fans.

## Example Homebridge Configuration
See also: `config-sample.json`

```json
"accessories": [
  {
    "accessory": "Dyson Fan",
    "homeKitFanType": "Fan",
    "name": "Bedroom Fan",
    "model": "475",
    "host": "192.168.1.110",
    "username": "NN8-AU-XXXXXXXX",
    "password": "x"
  }
]
```

## Setup

To obtain the password of your Dyson fan (which is permanently hardcoded in the fan itself), you'll need to use an MQTT client to connect to the fan's MQTT server and discover it by subscribing to a particular topic. (This is how Dyson's smartphone app bootstraps authentication during the initial setup of the Dyson Link app.)

1. Factory reset your fan by pressing and holding the ON/OFF button for longer than 20 seconds until it starts flashing white and green.
2. Note the `username` of your fan. This will be on a sticker on the base of your fan and will look something like: `NN8-AU-XXXXXXXX`.
3. Download an MQTT client. ([MQTT.fx](http://www.jensd.de/apps/mqttfx/) works well.)
4. On the same computer running the MQTT client, connect to the WiFi hotspot that your fan should have created (the SSID will begin with `DYSON`).
5. Connect your MQTT client to the IP address of the fan. (This will be something like `192.168.1.2`.)
6. Subscribe to the `475/initialconnection/credentials` topic which will result in the fan sending you the password. The `475` in the topic name is the model number of the fan and may be different for you depending on which fan you have. If `475` doesn't work for you, play around with different numbers above and below `475` until you find the right one, and then set the `model` field in `config.json` to this value. You'll know it's correct when the fan sends you a response with the password after subscribing to the topic.

Now that you have your fan's `username` and `password`, set these fields in your `config.json` and then use the official Dyson Link app to [finalise the setup](https://www.dyson.com.au/support/dp01/dyson-purecool-link-white-silver/the-dyson-link-app/setting-up-the-dyson-link-app-getting-connected-part-1) of your fan and connect it to your home WiFi network.

To ensure the IP address of your fan stays the same you can either change your router's DHCP lease duration to permanent or pin your fan's MAC address to a specific IP via your router's DHCP reservation feature. Use this IP address in the `host` field of the `config.json` file.

## Notes

There are currently two HomeKit fan types: `Fan` and `Fanv2`. The `Fanv2` type will only work on iOS 11 and if used, the fan won't appear in the accessory list in the Home app on iOS 10. For maximum compatibility use the `Fan` type in the `homeKitFanType` config field. This is also currently the default value for this field if it's not specified.

## Help

If you need any help, feel free to reach out to me on [Twitter](https://twitter.com/michaelelliot).
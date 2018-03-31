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

You will need the following values set in the homebridge config.json accessory definition to connect to your fan:
1. Device serial number (`username`);
2. Device setup Wi-Fi password (`password`);
3. Device IP address on your network (`host`).

To ensure the IP address of your fan stays the same you can either change your router's DHCP lease duration to permanent or pin your fan's MAC address to a specific IP via your router's DHCP reservation feature. Use this IP address in the `host` field of the `config.json` file.

If the value `475` as `model` doesn't work for you, play around with different numbers above and below `475` until you find the right one, and then set the `model` field in `config.json` to this value.

## Notes

There are currently two HomeKit fan types: `Fan` and `Fanv2`. The `Fanv2` type will only work on iOS 11 and if used, the fan won't appear in the accessory list in the Home app on iOS 10. For maximum compatibility use the `Fan` type in the `homeKitFanType` config field. This is also currently the default value for this field if it's not specified.

## Help

If you need any help, feel free to reach out to me on [Twitter](https://twitter.com/michaelelliot).

var mqtt = require('mqtt')
var Promise = require('promise');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-dyson-fan', 'Dyson Fan', FanAccessory);
};

function FanAccessory(log, config) {
  var self = this;
  this.log = log;

  if (typeof config.model !== 'undefined') this.modelNumber = config.model;
  else this.modelNumber = '475';

  if (typeof config.deviceName !== 'undefined') this.deviceName = config.deviceName;
  else this.deviceName = 'Dyson Fan';

  if (typeof config.deviceModel !== 'undefined') this.deviceModel = config.deviceModel;
  else this.deviceModel = '';
  
  if (typeof config.homeKitFanType !== 'undefined') this.homeKitFanType = config.homeKitFanType;
  else this.homeKitFanType = 'Fan';
  if (this.homeKitFanType !== 'Fan' && this.homeKitFanType !== 'Fanv2') throw("Unsupported HomeKit fan type '" + this.homeKitFanType + "'. Only 'Fan' or 'Fanv2' types supported for 'homeKitFanType' config field.");
  this.log("Using HomeKit fan type: " + this.homeKitFanType);

  this.name = config.name;
  this.mqttCommandChannel = this.modelNumber + "/" + config.username + "/command";
  this.mqttStatusChannel = this.modelNumber + "/" + config.username + "/status/current";

  this.deviceSerial = config.username;

  this.requestStatusPromise = null;
  this.requestStatusPromiseFulfill = null;

  this.state = {
    power: false,
    speed: 0,
    temperature: null,
    humidity: null,
    nightMode: true,
    autoMode: false,
    swingMode: Characteristic.SwingMode.SWING_DISABLED
  };

  this.client = mqtt.connect('mqtt://' + config.host, {
    username: config.username,
    password: config.password
  });

  this.client.on('connect', function () {
    log('(MQTT) Connected to ' + config.host)
    self.client.subscribe(self.mqttStatusChannel);
    self.requestCurrentState();
  });

  this.client.on("error", function(error) {
      log("(MQTT) Error:", error);
  });

  this.client.on('offline', function() {
      log("(MQTT) Offline");
  });

  this.client.on('reconnect', function() {
      log("(MQTT) Reconnect");
  });

  this.client.on('message', function (topic, message) {
    log("(MQTT) Received message from topic: " + topic);
    log("(MQTT) Message is: " + message);

    if (topic === self.mqttStatusChannel) {
      status = JSON.parse(message.toString());

      // 2997 - 2731.5
      if (status.msg === 'ENVIRONMENTAL-CURRENT-SENSOR-DATA') {
        if (!isNaN(status.data.tact)) self.state.temperature = Number(Math.round(parseFloat((status.data.tact - 2731.5) / 10) +'e1') + 'e-1');
        if (!isNaN(status.data.hact)) self.state.humidity = parseInt(status.data.hact);
        log("(MQTT) Received sensor data. Temperature: " + self.state.temperature + ". Humidity: " + self.state.humidity);

        if (self.requestStatusPromise !== null) {
          self.requestStatusPromiseFulfill(self.state);
          self.requestStatusPromise = null;
        }
      } else if (status.msg === 'CURRENT-STATE') {
        // {"msg":"CURRENT-STATE","time":"2017-04-11T07:21:06.000Z","mode-reason":"LAPP","state-reason":"MODE","dial":"OFF","rssi":"-43","product-state":{"fmod":"FAN","fnst":"FAN","fnsp":"0001","qtar":"0003","oson":"OFF","rhtm":"OFF","filf":"3352","ercd":"02C0","nmod":"ON","wacd":"NONE"},"scheduler":{"srsc":"6457","dstv":"0000","tzid":"0001"}}
        // Always override night mode
        self.state.nightMode = true; //status['product-state'].nmod !== 'OFF';
        self.state.power = status['product-state'].fmod !== 'OFF';
        self.state.autoMode = status['product-state'].fmod === 'AUTO';
        self.state.speed = parseInt(status['product-state'].fnsp) * 10;
        self.state.swingMode = status['product-state'].oson === 'ON' ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED;
        log("(MQTT) Got fan state. Power: " + (self.state.power ? "on" : "off") + ". Nightmode: " + self.state.nightMode + ". Speed: " + self.state.speed + "% / " + (self.state.speed / 10) + ". Swing: " + (self.state.swingMode ? "on" : "off") + ". Auto: " + (self.state.autoMode ? "on" : "off"));

      } else if (status.msg === 'STATE-CHANGE') {
        // {"msg":"STATE-CHANGE","time":"2017-04-11T07:22:27.000Z","mode-reason":"LAPP","state-reason":"MODE","product-state":{"fmod":["FAN","FAN"],"fnst":["FAN","FAN"],"fnsp":["0004","0004"],"qtar":["0003","0003"],"oson":["ON","OFF"],"rhtm":["OFF","OFF"],"filf":["3352","3352"],"ercd":["02C0","02C0"],"nmod":["ON","ON"],"wacd":["NONE","NONE"]},"scheduler":{"srsc":"6457","dstv":"0000","tzid":"0001"}}

        // TO AUTO:
        // Message is: {"msg":"STATE-CHANGE","time":"2017-04-24T08:07:28.000Z","mode-reason":"RAPP","state-reason":"MODE","product-state":{"fmod":["FAN","AUTO"],"fnst":["FAN","FAN"],"fnsp":["0003","AUTO"],"qtar":["0003","0003"],"oson":["OFF","OFF"],"rhtm":["ON","ON"],"filf":["3105","3105"],"ercd":["02C9","02C9"],"nmod":["ON","ON"],"wacd":["NONE","NONE"]},"scheduler":{"srsc":"6457","dstv":"0000","tzid":"0001"}}

        // Change air quality target:
        // Apr 24 08:09:22 hassbian homebridge[2619]: [4/24/2017, 8:09:22 AM] [Fan] (MQTT) Message is: {"msg":"STATE-CHANGE","time":"2017-04-24T08:09:19.000Z","mode-reason":"LAPP","state-reason":"ENV","product-state":{"fmod":["AUTO","AUTO"],"fnst":["OFF","FAN"],"fnsp":["AUTO","AUTO"],"qtar":["0003","0001"],"oson":["OFF","OFF"],"rhtm":["ON","ON"],"filf":["3105","3105"],"ercd":["02C9","02C9"],"nmod":["ON","ON"],"wacd":["NONE","NONE"]},"scheduler":{"srsc":"6457","dstv":"0000","tzid":"0001"}}

        // Always override night mode
        self.state.nightMode = true; //status['product-state'].nmod[1] !== 'OFF';
        self.state.power = status['product-state'].fmod[1] !== 'OFF';
        self.state.autoMode = status['product-state'].fmod[1] === 'AUTO';
        self.state.speed = parseInt(status['product-state'].fnsp[1]) * 10;
        self.state.swingMode = status['product-state'].oson[1] === 'ON' ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED;
        log("(MQTT) Got fan state. Power: " + (self.state.power ? "on" : "off") + ". Nightmode: " + self.state.nightMode + ". Speed: " + self.state.speed + "% / " + (self.state.speed / 10) + ". Swing: " + (self.state.swingMode ? "on" : "off") + ". Auto: " + (self.state.autoMode ? "on" : "off"));
      }

      return;
    }
  });
}

FanAccessory.prototype.requestCurrentState = function() {
  this.client.publish(this.mqttCommandChannel, JSON.stringify({ msg: "REQUEST-CURRENT-STATE", time: new Date().toISOString() }));
}

FanAccessory.prototype.getFanState = function() {
  self = this;

  if (self.requestStatusPromise !== null) return self.requestStatusPromise;

  self.requestStatusPromise = new Promise(function (fulfill, reject) {
    self.requestStatusPromiseFulfill = fulfill;
  });

  self.requestCurrentState();

  return self.requestStatusPromise;
}

FanAccessory.prototype.identify = function(callback) {
  this.log("Identify requested.");
  callback(null);
};

FanAccessory.prototype.getServices = function() {

  if (this.homeKitFanType === 'Fan') {
    this.fanService = new Service.Fan();
    this.fanService.getCharacteristic(Characteristic.On)
      .on('get', this.getOn.bind(this))
      .on('set', this.setOn.bind(this));
  } else if (this.homeKitFanType === 'Fanv2') {
    this.fanService = new Service.Fanv2();
    this.fanService.getCharacteristic(Characteristic.Active)
      .on('get', this.getOn.bind(this))
      .on('set', this.setOn.bind(this));
  }

  this.fanService.setCharacteristic(Characteristic.Name, 'Fan');
  this.fanService.getCharacteristic(Characteristic.SwingMode)
    .on('get', this.getSwingMode.bind(this))
    .on('set', this.setSwingMode.bind(this));

  this.fanService.getCharacteristic(Characteristic.RotationSpeed)
    .setProps({
      minValue: 0,
      maxValue: 100,
      minStep: 10,
    })
    .on('get', this.getSpeed.bind(this))
    .on('set', this.setSpeed.bind(this));

  this.temperatureService = new Service.TemperatureSensor();
  this.temperatureService.setCharacteristic(Characteristic.Name, 'Temperature');
  this.temperatureService.getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', this.getTemperature.bind(this));

  this.humidityService = new Service.HumiditySensor();
  this.humidityService.setCharacteristic(Characteristic.Name, 'Humidity');
  this.humidityService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
    .on('get', this.getHumidity.bind(this));

  this.informationService = new Service.AccessoryInformation();
  this.informationService
          .setCharacteristic(Characteristic.Name, this.deviceName)
          .setCharacteristic(Characteristic.Manufacturer, 'Dyson')
          .setCharacteristic(Characteristic.Model, this.deviceModel)
          .setCharacteristic(Characteristic.SerialNumber, this.deviceSerial);

  this.autoModeService = new Service.Switch();
  this.autoModeService.setCharacteristic(Characteristic.Name, 'Fan Auto');
  this.autoModeService.getCharacteristic(Characteristic.On)
    .on('get', this.getAutoMode.bind(this))
    .on('set', this.setAutoMode.bind(this));

  return [this.fanService, this.temperatureService, this.humidityService, this.informationService, this.autoModeService];
};

FanAccessory.prototype.getAutoMode = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state.autoMode);
  }, callback);
};

FanAccessory.prototype.setAutoMode = function(value, callback) {
  this.log("Setting fan auto mode " + value ? "on" : "off");
  this.state.autoMode = value;

  var data = {
    "msg": "STATE-SET",
    "time": new Date().toISOString(),
    "mode-reason": "LAPP",
    "data": { "fmod": this.state.autoMode ? "AUTO" : "FAN" }
  };
  if (this.state.autoMode) data.data.fnsp = "AUTO";
  this.client.publish(this.mqttCommandChannel, JSON.stringify(data));

  if (this.state.autoMode) {
    this.fanService.setCharacteristic(Characteristic.On, true);
    //this.fanService.setCharacteristic(Characteristic.RotationSpeed, null);
  }

  callback(null);
};

FanAccessory.prototype.getTemperature = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state.temperature);
  }, callback);
};

FanAccessory.prototype.getHumidity = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state.humidity);
  }, callback);
};

FanAccessory.prototype.getActive = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state.power ? 1 : 0);
  }, callback);
};

FanAccessory.prototype.setActive = function(value, callback) {
  this.log("Turning fan " + value ? "on" : "off");
  this.state.power = value;

  this.client.publish(this.mqttCommandChannel, JSON.stringify({
    "msg": "STATE-SET",
    "time": new Date().toISOString(),
    "mode-reason": "LAPP",
    "data": { "fmod": this.state.power ? "FAN" : "OFF", "nmod": this.state.nightMode ? "ON" : "OFF" }
  }));
  callback(null);
};

FanAccessory.prototype.getOn = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state && state.power);
  }, callback);
};

FanAccessory.prototype.setOn = function(value, callback) {
  this.log("Turning fan " + value ? "on" : "off");
  this.state.power = value;

  var data = {
    "msg": "STATE-SET",
    "time": new Date().toISOString(),
    "mode-reason": "LAPP",
    "data": { "fmod": this.state.power ? "FAN" : "OFF", "nmod": this.state.nightMode ? "ON" : "OFF" }
  };

  // Specify fan speed when turning on to prevent fan from sometimes defaulting back to a lower number
  if (this.state.speed > 0) data.data.fnsp = this.state.speed / 10;

  if (!this.state.power) {
    this.autoModeService.setCharacteristic(Characteristic.On, false);
  }

  this.client.publish(this.mqttCommandChannel, JSON.stringify(data));
  callback(null);
};

FanAccessory.prototype.getSpeed = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state.speed);
  }, callback);
};

FanAccessory.prototype.setSpeed = function(value, callback) {
  this.state.speed = value;

  var convertedSpeed = this.state.speed / 10;
  this.log("Fan speed changed to: " + this.state.speed + "% / " + convertedSpeed);
  this.client.publish(this.mqttCommandChannel, JSON.stringify({
    "msg": "STATE-SET",
    "time": new Date().toISOString(),
    "mode-reason": "LAPP",
    "data": { "fnsp": convertedSpeed, "nmod": this.state.nightMode ? "ON" : "OFF" }
  }));

  this.autoModeService.setCharacteristic(Characteristic.On, false);

  callback(null);
};

FanAccessory.prototype.getSwingMode = function(callback) {
  this.getFanState().then(function(state) {
    callback(null, state.swingMode);
  }, callback);
};

FanAccessory.prototype.setSwingMode = function(value, callback) {
  this.log("Turning " + (value === Characteristic.SwingMode.SWING_ENABLED ? "on" : "off") + " swing mode.");
  this.state.swingMode = value;

  this.client.publish(this.mqttCommandChannel, JSON.stringify({
    "msg": "STATE-SET",
    "time": new Date().toISOString(),
    "mode-reason": "LAPP",
    "data": { "oson": this.state.swingMode === Characteristic.SwingMode.SWING_ENABLED ? "ON" : "OFF" }
  }));

  callback(null);
};

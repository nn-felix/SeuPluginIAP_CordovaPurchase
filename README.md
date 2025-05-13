
# SeuPluginIAP_CordovaPurchase

A Cordova plugin for handling **In-App Purchases (IAP)** in mobile applications. This plugin provides a unified interface to manage purchases across platforms like **Android** and **iOS**, making it easier to integrate monetization features into your Cordova-based apps.

## Features

- Support for consumable and non-consumable products
- Subscription handling
- Purchase restoration
- Cross-platform compatibility (Android & iOS)
- Simple JavaScript API

## Installation

To install the plugin in your Cordova project, run:

```bash
cordova plugin add https://github.com/nn-felix/SeuPluginIAP_CordovaPurchase.git


document.addEventListener('deviceready', function () {
    store.verbosity = store.DEBUG;

    store.register({
        id: "your_product_id",
        type: store.CONSUMABLE
    });

    store.when("your_product_id").approved(function (product) {
        product.finish();
        // Unlock content or provide feature
    });

    store.refresh();
});

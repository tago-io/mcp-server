/**
 * Deterministic docs.tago.io fixtures for the docs tools. The llms.txt entries
 * are copied verbatim from the real https://docs.tago.io/llms.txt (trimmed to
 * a representative subset); the doc body is the real device-token.md, trimmed.
 */
const docsLlmsTxt = `# TagoIO Docs

> Documentation for TagoIO IoT platform, TagoDeploy, TagoCore, TagoTiP, and the TagoIO API.

This file contains links to documentation sections following the llmstxt.org standard.

## Table of Contents

- [Actions](https://docs.tago.io/docs/tagoio/actions/index.md): This article explains the Actions feature in TagoIO, what you can do with Actions, and how to create a new Action. It also provides links to relate...
- [Trigger by Schedule](https://docs.tago.io/docs/tagoio/actions/trigger-by-schedule.md): This article explains the "Trigger by Schedule" trigger type in TagoIO, describing its two categories (By Interval and By Date) and how to customiz...
- [Creating Analysis](https://docs.tago.io/docs/tagoio/analysis/creating-analysis.md): This article explains how to create a new Analysis in TagoIO, including the fields in the Add Analysis dialog and the options for runtime and execu...
- [Analysis Overview](https://docs.tago.io/docs/tagoio/analysis/index.md): This article explains what Analyses are in TagoIO, what you can do with them, how they are triggered, and links to related documentation and examples.
- [Blueprint Dashboard](https://docs.tago.io/docs/tagoio/dashboards/blueprint-dashboard.md): This article explains the Blueprint Dashboard in TagoIO, describing how it links widgets to multiple devices for scalable applications and introduc...
- [Dashboard Overview](https://docs.tago.io/docs/tagoio/dashboards/index.md): Learn about TagoIO dashboards - where you place widgets to visualize and interact with data in real-time, and share with end-users through TagoRUN.
- [Adding Devices with Connectors](https://docs.tago.io/docs/tagoio/devices/adding-devices-with-connectors.md): This article explains how connectors let you create devices with built-in behaviors to communicate with networks, and describes the available metho...
- [Configuration Parameters for Devices](https://docs.tago.io/docs/tagoio/devices/configuration-parameters-for-devices.md): This article explains what Configuration Parameters are in TagoIO devices, where to find them, and the three configurable fields for each parameter...
- [Device Token](https://docs.tago.io/docs/tagoio/devices/device-token.md): This article explains what a Device Token is in TagoIO and how to locate and copy it from a device's General Information tab.
- [Getting Data](https://docs.tago.io/docs/tagoio/devices/getting-data.md): This article explains how to request data from the TagoIO API, including the required regional endpoint, authorization header, endpoint URL, and av...
- [Devices](https://docs.tago.io/docs/tagoio/devices/index.md): What a Device is in TagoIO, how devices communicate, and how to choose a data storage type: immutable, mutable, or hybrid.
- [Payload Parser](https://docs.tago.io/docs/tagoio/devices/payload-parser/index.md): This article explains how the Payload Parser processes raw device payloads to extract measured variables, convert units in real time, and how conne...
- [Entities](https://docs.tago.io/docs/tagoio/entities/entities.md): A concise overview of the TagoIO Entities feature, explaining its purpose, typical use cases, and instructions for creating a new Entity in the Adm...
- [Managing Entities](https://docs.tago.io/docs/tagoio/entities/managing-entities.md): How to manage fields, data types, indexes, and the Schema Parser in a TagoIO Entity, plus limits per plan.
- [Account Token](https://docs.tago.io/docs/tagoio/profiles/account-token.md): This article explains what Account Tokens are in TagoIO, why they must be kept secret, and how to manage them from your account profile. It also hi...
- [Data Output Service](https://docs.tago.io/docs/tagoio/profiles/services/data-output-service.md): This article explains how Data Output transactions are counted in TagoIO, how to set monthly Data Output limits per Profile, and how different acti...
`;

const docsDeviceTokenPage = `---
title: "Device Token"
description: "This article explains what a Device Token is in TagoIO and how to locate and copy it from a device's General Information tab."
---

# Device Token

> This article explains what a Device Token is in TagoIO and how to locate and copy it from a device's General Information tab.

The secret key used between TagoIO and your device is called a Device Token. Any access from a device is granted only with a valid token. This token should be kept secret and shared only with people you trust.

:::note

Each time a device is created, the system automatically creates a device token.

:::

Unlike other [token types](/docs/tagoio/profiles/account-token.md#token-format-and-prefixes), device tokens are returned without a type prefix. They are provisioned into hardware and firmware where the token length is often fixed, so the raw form is preserved to avoid breaking those clients.

## Finding the Device Token

- Open the [Devices](https://admin.tago.io/devices) module in the TagoIO Console.
- Select the device you want to get the token for.
- Go to the "General" tab.
- In the "Token & Serial Number" window, click on the 3 dot menu.
- Select "Copy Token" to copy the token to the clipboard.

## Security recommendations

- Treat the device token like a password — do not expose it in public repositories, logs, or client-side code.
- Only share the token with systems or people that must interact with the device.
`;

export { docsDeviceTokenPage, docsLlmsTxt };

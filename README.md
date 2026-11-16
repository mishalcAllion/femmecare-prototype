# FemmeCare sales system prototype

A clickable prototype of the FemmeCare sales system, covering retail outlet orders and the consultant channel. Built by Allion Technologies for the Selyn FemmeCare presales demo.

Everything in it is demo data. No email, SMS, payment or courier booking leaves the browser.

**Try it:** https://mishalcallion.github.io/femmecare-prototype/

| Start at | How to sign in |
|---|---|
| [Staff console](https://mishalcallion.github.io/femmecare-prototype/staff/login) | A work email such as `ruwan.j@femmecare.lk`, then the 6-digit code. Find the code in the demo panel's Outbox, or turn on presenter mode and it fills itself in |
| [Consultant app](https://mishalcallion.github.io/femmecare-prototype/signin) | Consultant number `FC00006`, password `femmecare` |
| Demo panel | Press **Ctrl+Shift+D**: switch people, scenarios and the demo clock, trigger events, save snapshots, read the Outbox |

The data lives in your own browser, so each visitor gets their own copy and a refresh keeps your progress. To start again, use the demo panel, Scenario tab, **Reset to the start of this scenario**.

## Demo playbook

[playbook/playbook.md](playbook/playbook.md) walks through two use cases step by step, with screenshots and the questions to ask the client:

1. A retail outlet order, through stock, to dispatch and delivery ([narrated video, 3:32](playbook/video/1-outlet-order-to-delivery.mp4))
2. A consultant order, through payment, to courier dispatch and delivery ([narrated video, 2:02](playbook/video/2-consultant-order-to-delivery.mp4))

## Run it on your own machine

Needs Node.js 22 or later.

```
cd prototype
npm install
npm run dev
```

Then open http://localhost:5190.

Pushing a change to `prototype/` on `main` republishes the online demo through GitHub Actions.

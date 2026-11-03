# app

This template should help get you started developing with Vue 3 in Vite.

The app includes a login/register screen and a group-chat home page.
After a successful login, the app navigates to `/home`. When mock authentication is
enabled with `VITE_USE_MOCK=true`, use `admin` / `123456` to sign in.

The home page includes an interest-tag-based group chat directory. Group chat
mock data, direct-join responses, and joined-group conversations are served by
the shared MSW handlers. Joined-group chats include a "See you tomorrow" tool
for recording that the current user plans to stay in the group tomorrow; the
preference is served by the shared MSW handlers.
In mock mode, a WebSocket supplies demo group messages. The client refreshes
the full group list on connection/reconnection and every 60 seconds; unread
groups are sorted before read groups, with the most recently active groups first.
The mock emits demo messages every 20 seconds. Read receipts identify the latest
displayed message, and unread counts are calculated per user and group from the
monotonically advancing read cursor.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

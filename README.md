# app

This frontend is built with Vue 3 and Vite.

The app opens with a welcome page and a group-chat home page. Selecting **开始**
creates a temporary guest ID in browser storage and navigates to `/home`; no
account registration or login is required.

The home page includes an interest-tag-based group chat directory. Group chat
mock data, direct-join responses, and joined-group conversations are served by
the shared MSW handlers. Joined-group chats include a "See you tomorrow" tool
for recording that the current user plans to stay in the group tomorrow; the
preference is served by the shared MSW handlers.
The home page also includes a spectator-group directory sorted by the heat of
its source interest group. Spectator groups are separate conversations: their
members can chat normally, while messages from the source interest group appear
in real time with a source label; spectator conversations do not load message
history from before the user joined, while retaining and showing messages from
the join time onward. Spectator messages do not display sender IDs or avatars.
Spectator joins identify the source interest group and spectator mode, and the
handler resolves the matching spectator group. A spectator group can be
converted into an interest group using the source group's interest tags. Group tools include a
"See you tomorrow" preference for interest groups and a "See you next minute"
preference for spectator groups. A user can actively watch only one spectator
group at a time; while watching one, the spectator directory is replaced with
an explanation and a shortcut back to the current group.
In mock mode, a WebSocket supplies demo group messages. The client refreshes
the full group list on connection/reconnection and every 60 seconds; unread
groups are sorted before read groups, with the most recently active groups first.
The mock emits demo messages every 20 seconds. Read receipts identify the latest
displayed message, and unread counts are calculated per user and group from the
monotonically advancing read cursor. In interest-group chats, the @ picker lets
members select another group member; messages that mention the current user keep
a visible mention highlight when revisiting the chat, while unread mentions are
also counted separately in the joined-group list. New messages keep the chat
scrolled to the latest message.

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

## License

This project is licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.

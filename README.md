# People into perspective

A small site for seeing the people behind a number. Type a count, explore an exact crowd, and zoom from the whole group to a single person.

Run locally with Node 20 or newer:

```sh
npm start
```

Open http://localhost:4173. Run the count and layout checks with `npm test`. No installation or build step is needed. On Windows with PowerShell script restrictions, use `npm.cmd start` and `npm.cmd test`.

Deploy to Netlify by importing this repository and selecting the `Toom68/People-in-perspective` branch. The root `netlify.toml` sets the base directory to the repository root, leaves the build command empty, and publishes `site/dist/`. No environment variables or server process are required. For a manual drag-and-drop deployment, upload the `site/dist/` folder itself so `index.html` is at the deployed root.

The site lives in `site/dist/`, with a small local server in `site/scripts/`. It accepts whole counts from zero to JavaScript’s largest exact integer (9,007,199,254,740,991), including shortcuts such as `100k` and `1.5 million`. The canvas uses a virtual grid instead of allocating an element per person. At subpixel scales the overview shows density; zooming resolves individual figures. Meeting times assume one introduction per second and 365 days per year.

Sharing copies a URL with the count in its `n` query parameter. All interaction runs in your browser; no accounts or database are needed by the application.

# Third-party notices

## Beautiful UI

`dashboard/styles/globals.css` and the files in `dashboard/components/beautiful-ui/`
are vendored from [Beautiful UI](https://www.beautifului.dev) by Shane Levine
([source](https://github.com/slev12397/beautiful-ui)), used under the MIT License.
The full license text is in [`LICENSE-Beautiful-UI`](./LICENSE-Beautiful-UI).

Local changes are limited to: `CodeBlock` accepts a `className` so the payload
panel can use the full row width. `SearchField` and `FilterChips` are adapted
from the gallery's `SearchList` and `FilterTable` demos (same markup and tokens,
driven by props instead of demo data).

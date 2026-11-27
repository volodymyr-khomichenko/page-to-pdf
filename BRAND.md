# Page to PDF — brand

Permanent visual identity for **Page to PDF — Full Page Screenshot**. Follow this file in every future change. Do not rename the product.

Design concept: **Full Page**. Corporate, minimal, professional. Same system as Breaklock and the type on [khomichenko.com](https://khomichenko.com/): white canvas, one blue accent, Roboto, 3px corners, no decoration that is not the product.

## Do not change the approved graphics

The files below were approved as-is. Do not redraw, regenerate, recolor, or restyle them without explicit approval. If a new size is required, ask first.

## Color

| Role | Token | Hex |
|---|---|---|
| Accent | `--color-stamp` / `--stamp` | `#2449D8` |
| Background and cards | `--color-paper`, `--color-card` | `#FFFFFF` |
| Primary text | `--color-ink` / `--ink` | `#111827` |
| Secondary text | `--color-muted` / `--muted` | `#526071` |
| Borders | `--color-line` / `--line` | `#DCE1EA` |
| Text on accent | `--color-stamp-fg` | `#FFFFFF` |

The earlier green `#1F4D3A` and the interim blue `#5B79FF` are retired. Use the accent only for buttons, links, the kicker, and the approved icon. No gradients, no extra brand colors, no third-party logos.

`theme-color` is `#2449D8`.

## Typography

Match khomichenko.com: **Roboto** at 400, 500, and 700, then Arial, then sans-serif.

- Landing loads Roboto from Google Fonts.
- The extension result page does not call the network for fonts. It uses `Roboto, Arial, sans-serif` so it still works offline.
- Headings and buttons are 700. Body line-height is about 1.7.
- Buttons are uppercase with slight letter-spacing.

## Shape and UI

- Buttons: 3px corner radius, min-height 44px, uppercase, bold. Primary is a solid accent. Secondary is a white fill with an accent border.
- Panels and the result image use a 1px `#DCE1EA` border. No large shadows, no pills (`border-radius: 999px`).
- Spacing stays on the existing landing rhythm: page padding, sections separated by a top border.
- The capture progress chip uses the same accent, white type, and 3px radius. That is color only. Do not change how slices are taken.
- Do not add a “Available in Chrome Web Store” badge, or any store badge, before the listing is actually published.

## Assets

Approved originals also live together at `public/brand/` so the site and later promo work can use them.

| Use | Path |
|---|---|
| Toolbar, 16 | `extension/icons/icon16.png` |
| Small icon, 32 | `extension/icons/icon32.png` |
| Extensions page, 48 | `extension/icons/icon48.png` |
| Store and extension, 128 | `extension/icons/icon128.png` |
| Store listing icon | `store-assets/icon-128.png` |
| Store promo, 440×280, no reliance on a redesign | `store-assets/promo-small-440x280.png` |
| Landing illustration | `public/brand/dashboard-preview.png` |
| Scalable icon, promo, and dashboard | `public/brand/*.svg` |

`extension/manifest.json` points `action.default_icon` and `icons` at `extension/icons/`. The result page shows `icons/icon32.png`. The landing illustration is `/brand/dashboard-preview.png`. The site icon is `/brand/icon32.png` and `/brand/icon32.svg`.

`public/og.png` is the existing share image. It is not one of the approved files. Do not overwrite it with a generated card.

## Product rules that stay with the brand

- The name stays exactly `Page to PDF — Full Page Screenshot`.
- This is a visual capture of a page the person already has open. It is not a data export, not a login bypass, and not a built-in chat with an AI.
- Permissions stay `debugger`, `activeTab`, and `alarms`. No host permissions.
- Do not publish to the Chrome Web Store from a design change.

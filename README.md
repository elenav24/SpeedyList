# SpeedyList: Depop to Vinted

Small, local-first Chrome extension for copying listing details from a Depop edit page into Vinted's item creation form. The extension does not publish listings or automate submission; review the data and complete the form yourself.

## Important: Terms and Account Safety

Use this project only if your use complies with Depop's and Vinted's current terms, policies, and applicable law. You are responsible for checking whether copying listing content and using browser-assisted form filling are allowed for your account and region. Do not use this extension to bypass platform safeguards, rate limits, moderation, or other controls. Synthetic form events are provided for ordinary frontend state compatibility; they do not make automated activity undetectable or permitted. Use at your own risk; this project is not affiliated with Depop or Vinted.

## Files

```text
.
|-- manifest.json
|-- README.md
|-- popup
|   |-- popup.css
|   |-- popup.html
|   `-- popup.js
`-- scripts
	|-- depop-edit-scraper.js
	`-- vinted-listing-filler.js
```

## Supported Pages and Permissions

- Depop edit pages at `https://www.depop.com/products/edit/` and item-specific URLs beneath that path.
- Vinted item creation pages on `vinted.com` and its subdomains, under `/items/new`.
- Extension API permissions are `storage` and `clipboardWrite` (used only when you explicitly copy a field). Host access is limited to those two site families.

The requested source patterns `https://*://*` and `https://*.vinted.*/*` are not valid Chrome match patterns. This project uses valid, narrower patterns instead. Other Vinted country domains are not included; add explicit domains to both `host_permissions` and the relevant content-script `matches` before using them.

## Install for Development

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the project directory containing `manifest.json`.
4. Open a Depop edit page and click the pinned SpeedyList toolbar icon.
5. In the popup, click **Capture this Depop listing**. The extension reads the description, category, optional material and size, brand, condition, colors, package size, and price into `chrome.storage.local`.
6. Review the saved fields in the popup. Click any populated field row to copy that value; a confirmation appears at the bottom.
7. Open a Vinted item creation page. The extension fills category, brand, size, condition, colors, material, price, and package size in order. Dropdowns use their field test IDs, search when available, and match exact text before case-insensitive or partial matches.
8. If selecting a category reveals more fields, click **Retry empty fields** at the top-right of the page. It fills newly available empty fields without overwriting values already present.
9. Review every field, correct anything needed, and submit the listing yourself.

The pending listing is stored in `chrome.storage.local`. If a required Vinted field cannot be found or a value cannot be matched, the extension leaves the payload in storage so you can retry after checking the page or updating selectors. Material is optional.

On a Depop edit page, the popup's **Capture this Depop listing** action uses internal extension messaging, so it does not create a Network request. Scrape and fill details are logged with the `[SpeedyList]` prefix in the page console.

## DOM Compatibility

Marketplace markup can change without notice. Depop and Vinted selectors and condition mappings are configurable at the top of their respective content scripts. The first line of the Depop description becomes the Vinted title; remaining lines become the Vinted description. The extension does not convert currencies, copy images, or submit the listing. Check all fields before proceeding.

## Manual Checks

- On a Depop edit page, click the toolbar icon and confirm each field is logged with the `[SpeedyList]` prefix.
- Confirm the payload includes title, description, category, material, brand, size, condition, colors, package size, price, source URL, and a creation timestamp.
- On Vinted's item creation page, confirm text fields receive input/change events, dropdown options match, and storage clears only after required fields are filled.
- Confirm a missing field or storage error is reported without silently discarding the pending payload.
- Confirm the extension does not run on unrelated sites or pages.

## Contributing

Keep permissions limited to the required site families and storage access. Test selector changes manually on both supported page types, and update this README when domain support or behavior changes. Do not add remote code or automate final listing submission.
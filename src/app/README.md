# app.js source split (v1.3.6)

This directory contains source sections for the bundled `app.js`.

Important:
- The browser still loads `app.js` only.
- `*.part.js` files are not standalone JavaScript files.
- Rebuild the bundle with:

```bash
python3 tools/build_app.py
```

Split map:

- `00_core_start.part.js`: Core start / shared helpers
- `10_entry.part.js`: Entry and edit form
- `20_list.part.js`: Transaction list and bulk edits
- `30_analysis_base.part.js`: Legacy analysis base
- `40_accounts_cards.part.js`: Accounts and card cycles
- `50_report_analysis_period.part.js`: Report and v1.3.5 period analysis
- `60_settings_recurring.part.js`: Settings, recurring, categories, templates
- `70_import_excel.part.js`: Excel migration importer
- `80_budget_goals.part.js`: Budget and goals
- `90_wishlist_price.part.js`: Wishlist and price comparison
- `99_nav_boot.part.js`: Navigation, binding, boot

# Chill

Know what's in your fridge. A shared fridge, freezer and pantry tracker with expiration dates, quantities, barcode scanning, a shopping list and AI dinner ideas scaled to your household.

## Deploy on Netlify

1. In Netlify, choose Add new site, then Import an existing project, and pick this repo.
2. Leave the build command empty. Publish directory and functions are set in `netlify.toml`.
3. Under Site configuration, Environment variables, add:
   - `HOUSEHOLD_CODE`: a passcode you and your spouse both type once per device. To give someone their own separate fridge (a parent, say), add another code separated by a comma, like `ourcode,momscode`. Each code opens its own fridge.
   - `ANTHROPIC_API_KEY`: from console.anthropic.com. Needed for dinner ideas and photo reading.
   - `ANTHROPIC_MODEL` (optional): defaults to `claude-haiku-4-5`.
4. Redeploy, open the site on your phone, enter the code, then Add to Home Screen.

## Notes
- Data is stored in Netlify Blobs and shared live (refreshes every 8 seconds).
- Barcode lookups use Open Food Facts. A name you type for an unknown barcode is remembered on that device.
- `test/` holds a local mock server and Playwright checks: `node test/server.mjs`, then `node test/flow.cjs`.

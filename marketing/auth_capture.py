from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    target = Path("auth.json")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://m.aliexpress.com", wait_until="domcontentloaded")
        input(
            "Login in the opened browser, then press Enter here to save auth.json..."
        )
        context.storage_state(path=str(target))
        browser.close()
    print(f"Saved {target.resolve()}")


if __name__ == "__main__":
    main()

from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Go to Vite dev server port
            page.goto('http://localhost:5173/')
            # Wait for any component to load to confirm it works
            page.wait_for_timeout(5000)
            page.screenshot(path="frontend_verification.png")
            print("Screenshot saved to frontend_verification.png")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()

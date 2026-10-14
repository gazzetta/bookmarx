# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collection-switch.spec.ts >> Collection switch with pending changes >> switching collection with pending changes shows SwitchConfirmDialog
- Location: tests\extension\collection-switch.spec.ts:15:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: worker.evaluate: Target page, context or browser has been closed
Browser logs:

<launching> C:\Users\Gazza\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --no-sandbox --disable-extensions-except=C:\CODING\bookmarx\src\extension\dist --load-extension=C:\CODING\bookmarx\src\extension\dist --no-first-run --no-default-browser-check --user-data-dir=C:\Users\Gazza\AppData\Local\Temp\bookmarx-l3-profile-fhSkV0 --remote-debugging-pipe about:blank
<launched> pid=114876
[pid=114876][err] [114876:115552:1014/121326.971:ERROR:google_apis\gcm\engine\registration_request.cc:291] Registration response error message: DEPRECATED_ENDPOINT
[pid=114876] <gracefully close start>
```

# Test source

```ts
  175 |   const url = `chrome-extension://${extId}/${pagePath}`;
  176 |   // Open the extension page in a new tab
  177 |   const newPage = await page.context().newPage();
  178 |   await newPage.goto(url);
  179 |   return newPage;
  180 | }
  181 | 
  182 | export async function openPopup(page: Page): Promise<Page> {
  183 |   return getExtensionPage(page, 'popup/index.html');
  184 | }
  185 | 
  186 | export async function getBackgroundWorker(): Promise<any> {
  187 |   if (!_context) throw new Error('No extension context');
  188 |   const workers = _context.serviceWorkers();
  189 |   if (workers.length === 0) {
  190 |     await _context.waitForEvent('serviceworker', { timeout: 10000 });
  191 |   }
  192 |   return _context.serviceWorkers()[0];
  193 | }
  194 | 
  195 | // Send a message to the background service worker via CDP.
  196 | // This simulates what the popup does with chrome.runtime.sendMessage.
  197 | export async function sendBackgroundMessage(message: any): Promise<any> {
  198 |   const worker = await getBackgroundWorker();
  199 |   // Use Runtime.evaluate to call chrome.runtime.sendMessage from the SW context
  200 |   // Actually, we need to evaluate IN the service worker context.
  201 |   // Playwright's worker.evaluate runs in the worker global scope.
  202 |   const result = await (worker as any).evaluate(async (msg: any) => {
  203 |     return new Promise((resolve) => {
  204 |       // @ts-ignore — chrome is available in the SW context
  205 |       chrome.runtime.sendMessage(msg, (response: any) => {
  206 |         // @ts-ignore
  207 |         const err = chrome.runtime.lastError;
  208 |         if (err) {
  209 |           resolve({ __error: err.message });
  210 |           return;
  211 |         }
  212 |         resolve(response);
  213 |       });
  214 |     });
  215 |   }, message);
  216 |   return result;
  217 | }
  218 | 
  219 | // Evaluate an expression in the service worker context
  220 | export async function evalInBackground(fn: any, arg?: any): Promise<any> {
  221 |   const worker = await getBackgroundWorker();
  222 |   return (worker as any).evaluate(fn, arg);
  223 | }
  224 | 
  225 | // Seed auth directly into chrome.storage.local from the service worker context.
  226 | // This avoids needing to drive the popup's login form for tests that just need
  227 | // an authenticated extension state.
  228 | export async function seedAuthInExtension(auth: AuthState): Promise<void> {
  229 |   const authData = {
  230 |     token: auth.token,
  231 |     user: {
  232 |       id: auth.userId,
  233 |       email: auth.email,
  234 |       displayName: null,
  235 |       isPremium: auth.isPremium,
  236 |       subscriptionTier: auth.isPremium ? 'premium' : 'free',
  237 |     },
  238 |   };
  239 |   await sendFromTestPage({ action: 'setAuth', data: authData });
  240 | }
  241 | 
  242 | // Clear all extension storage (useful between tests)
  243 | export async function clearExtensionStorage(): Promise<void> {
  244 |   await sendFromTestPage({ action: 'clearStorage' });
  245 | }
  246 | 
  247 | async function sendFromTestPage(message: any): Promise<any> {
  248 |   if (!_context || !_extensionId) throw new Error('Extension context is unavailable');
  249 |   const page = await _context.newPage();
  250 |   try {
  251 |     await page.goto(`chrome-extension://${_extensionId}/popup/debug.html`);
  252 |     const result: any = await page.evaluate(msg => new Promise(resolve => {
  253 |       // @ts-ignore
  254 |       chrome.runtime.sendMessage(msg, (response: any) => resolve(response));
  255 |     }), message);
  256 |     if (!result?.success) throw new Error(`Test message failed: ${JSON.stringify(result)}`);
  257 |     return result;
  258 |   } finally { await page.close(); }
  259 | }
  260 | 
  261 | // Get all extension storage
  262 | export async function getExtensionStorage(): Promise<any> {
  263 |   return evalInBackground(async () => {
  264 |     // @ts-ignore
  265 |     return new Promise((resolve) => {
  266 |       // @ts-ignore
  267 |       chrome.storage.local.get(null, (items: any) => resolve(items));
  268 |     });
  269 |   });
  270 | }
  271 | 
  272 | // Create a bookmark via chrome.bookmarks API in the service worker context.
  273 | // This simulates what happens when a user uses the native star button.
  274 | export async function createBookmarkViaApi(parentId: string, title: string, url: string): Promise<string> {
> 275 |   const result = await (await getBackgroundWorker() as any).evaluate(async (params: any) => {
      |                                                             ^ Error: worker.evaluate: Target page, context or browser has been closed
  276 |     // @ts-ignore
  277 |     return new Promise((resolve) => {
  278 |       // @ts-ignore
  279 |       chrome.bookmarks.create({ parentId: params.parentId, title: params.title, url: params.url }, (bm: any) => {
  280 |         // @ts-ignore
  281 |         const err = chrome.runtime.lastError;
  282 |         if (err) { resolve({ __error: err.message }); return; }
  283 |         resolve({ id: bm.id });
  284 |       });
  285 |     });
  286 |   }, { parentId, title, url });
  287 |   return result?.id ?? '';
  288 | }
  289 | 
  290 | // --- Fixture export ---
  291 | 
  292 | export interface ExtensionFixtures {
  293 |   context: BrowserContext;
  294 |   extensionId: string;
  295 |   page: Page;
  296 |   freeAccount: AuthState;
  297 |   premiumAccount: AuthState | null;
  298 | }
  299 | 
  300 | export const test = base.extend<ExtensionFixtures>({
  301 |   context: async ({}, use) => {
  302 |     const { context, extensionId, userDataDir } = await createExtensionContext();
  303 |     _context = context;
  304 |     _extensionId = extensionId;
  305 |     await use(context);
  306 |     // Close this test's browser, then remove its profile so nothing leaks into the next test
  307 |     await context.close();
  308 |     _context = null;
  309 |     _extensionId = null;
  310 |     fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  311 |   },
  312 |   extensionId: async ({ context }, use) => {
  313 |     await use(_extensionId!);
  314 |   },
  315 |   page: async ({ context }, use) => {
  316 |     // Create a new page within the extension context
  317 |     const page = await context.newPage();
  318 |     await use(page);
  319 |     // Don't close — context cleanup handles it
  320 |   },
  321 |   freeAccount: async ({}, use) => {
  322 |     const auth = await registerFreeUser();
  323 |     await use(auth);
  324 |     await cleanup(auth);
  325 |   },
  326 |   premiumAccount: async ({}, use) => {
  327 |     let auth: AuthState;
  328 |     if (PREMIUM_PASSWORD) auth = await loginUser(PREMIUM_EMAIL, PREMIUM_PASSWORD);
  329 |     else if (['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname)) {
  330 |       const local = await registerFreeUser();
  331 |       grantLocalTestPremium(BASE_URL, local.userId, local.email);
  332 |       auth = await loginUser(local.email, local.password);
  333 |     } else {
  334 |       test.skip(true, 'Remote premium tests require explicit test-account credentials');
  335 |       return;
  336 |     }
  337 |     if (!PREMIUM_PASSWORD) {
  338 |       const seed = await postJSON('/capture', { title: 'Premium fixture bookmark', url: 'https://example.test/premium-fixture' }, auth.token);
  339 |       if (!seed.success) throw new Error('Premium fixture bookmark could not be created');
  340 |     }
  341 |     await use(auth);
  342 |     await cleanup(auth);
  343 |   },
  344 | });
  345 | 
  346 | export { expect };
  347 | export { BASE_URL };
  348 | export function apiBase(): string { return API; }
  349 | 
```
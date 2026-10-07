# Cloud sync (Cloudflare R2, Amazon S3)

A local install can keep its work on the computer only (the default), or on the computer **and** in the person's own S3-compatible bucket: Cloudflare R2, Amazon S3, or any other service that speaks S3 (MinIO, Backblaze B2, Wasabi…).

- Everything is saved on the computer first. The app never waits for the network.
- With a connection, changes go up to the bucket within seconds; changes made elsewhere come down.
- Without a connection, work goes on. Records not uploaded yet show as **This computer only**, and go up by themselves when the bucket can be reached again.
- Installing again (after removing OpenCanvas, or on a new computer) and choosing the same bucket brings the whole library back.

[بالعربية ↓](#بالعربية)

## Setting it up

The installer asks once:

```
Where should OpenCanvas keep your work?

  1) On this computer only
  2) On this computer, and synced to your own cloud storage (Cloudflare R2 or Amazon S3)
```

For the cloud it asks for the provider and details, then **checks them** by writing, reading and deleting a test file in the bucket. On failure it explains the problem in plain words (wrong secret, unknown key, no such bucket, no access, unreachable address) and offers to try again, change the details, or skip and stay on this computer. A field typed wrong (bucket name, account ID, region, endpoint) is asked again on its own. If the bucket already holds an OpenCanvas library, it says so ("Found your OpenCanvas library from before: 12 designs, 40 files"): it comes back when the app opens.

Later, in a terminal:

| Command | |
| --- | --- |
| `opencanvas cloud` | Set up or change the cloud storage |
| `opencanvas cloud status` | Show where work is kept |
| `opencanvas cloud off` | Keep everything on this computer only (the bucket is left as it is) |

Without a terminal (or to automate), the answers can come from the environment: `OPENCANVAS_STORAGE=local|r2|s3|custom` with `OPENCANVAS_S3_ACCOUNT_ID` (R2), `OPENCANVAS_S3_REGION` (S3), `OPENCANVAS_S3_ENDPOINT` (custom), `OPENCANVAS_S3_BUCKET`, `OPENCANVAS_S3_ACCESS_KEY_ID`, `OPENCANVAS_S3_SECRET_ACCESS_KEY` and optionally `OPENCANVAS_S3_PREFIX` (folder in the bucket, default `opencanvas`). Wrong details then fall back to "this computer only" with the reason printed.

### What the keys need

- **R2:** an API token with *Object Read & Write* on the bucket (Cloudflare dashboard → R2 → Manage R2 API Tokens), and the account ID from the R2 overview.
- **S3:** an IAM user with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/*` and `s3:ListBucket` on `arn:aws:s3:::BUCKET`.

## How it works

```
 browser (IndexedDB) ── /api/cloud/* ──▶ local OpenCanvas server ── signed S3 requests ──▶ your bucket
   the working copy        same computer        holds the keys (cloud.json, 0600)
```

- **The keys never reach the browser.** The installer's answers go to the local server (`POST /api/cloud/setup`, which needs a one-time token written in the install folder), which checks them and writes `$OPENCANVAS_HOME/cloud.json`, readable by its owner only. The server signs every S3 request itself (AWS Signature V4, `apps/web/src/lib/cloud/s3.ts`).
- **Only OpenCanvas may use the cloud API.** The server listens on 127.0.0.1; `/api/cloud/*` also requires a `localhost`/`127.0.0.1` Host (no DNS rebinding), a same-origin Origin, and the `X-OpenCanvas-Sync` header, which other websites cannot send without a CORS preflight the server never allows. A hosted or Docker server has no `OPENCANVAS_HOME`, so cloud sync is off there.
- **Layout in the bucket** (under the folder, `opencanvas/` by default):

  | Path | Content |
  | --- | --- |
  | `space.json` | Marks the folder as an OpenCanvas library |
  | `records/<store>/<key>.json` | One record: a design, an upload, a folder, a brand kit, a font, an icon pack, a plugin, or a deletion marker |
  | `blobs/<sha256>` | File contents (photos, PDFs pages, fonts, plugin files), stored once and never changed |

  Thumbnails are not synced: each computer redraws them.

### The sync engine

`apps/web/src/lib/cloud/engine.ts` compares every record three ways: what this computer has now, what the bucket has now, and what both had at the last sync (kept per record in IndexedDB).

| This computer | The bucket | Result |
| --- | --- | --- |
| changed | unchanged | upload |
| unchanged | changed | download |
| deleted | unchanged | delete in the bucket (a deletion marker) |
| unchanged | deleted | delete here |
| changed | changed, same content | nothing to do |
| changed | changed | **designs:** the newer stays, the older is kept as a copy "… (from another computer)"; **other records:** the newest wins |
| deleted | changed (or the reverse) | the edit wins: nothing is lost |

- **No overwrites between computers.** Uploads are conditional: `If-Match` on the version that was compared, `If-None-Match: *` for new records. If another computer wrote in between, the upload is refused and the next round merges.
- **No overwrites of local edits.** A download only replaces a local record that has not changed since it was compared (checked inside the IndexedDB transaction). A design that is downloaded gets a new local revision, so an open editor loads it, or offers to keep its own edits as a copy.
- **A new, empty computer never deletes anything.** Deletion markers are only written for records this computer had synced before.
- **Offline is not an error.** When the bucket cannot be reached, a round stops at once; what changed stays pending, and the next round (every 20 seconds, 10 seconds while offline, at once when the browser goes back online, and a moment after every change) uploads it. Only one tab syncs at a time (Web Locks).
- **Changing the bucket** (or the folder) starts afresh: the bookkeeping is cleared and everything is compared and uploaded again.

## Tests

- `apps/web/test/cloud/engine.test.ts`: two fake computers and a fake bucket: restore, offline, a connection dropping mid-round, both kinds of conflicts, deletions, races, convergence.
- `apps/web/test/cloud/s3.test.ts`: the signature against the examples of the AWS documentation, URLs, XML, errors.
- `apps/web/test/cloud/s3-integration.test.ts`: the client against a real S3 server with authentication (`scripts/s3-test-server.py`, moto), including conditional writes and wrong keys.
- `apps/web/e2e/cloud.spec.ts` (`playwright.cloud.config.ts`): in the browser, against that server: upload, offline with "This computer only" then automatic upload, restore on a new computer, an open editor following a change, two computers editing the same design, deletions, and that other websites cannot use the API or see the keys.
- `scripts/test-install-cloud.sh` / `.ps1` (Install test workflow, macOS, Linux, Windows): the installer with wrong keys, right keys, and a reinstall that finds the library.

---

<div dir="rtl" lang="ar">

## بالعربية

عند التثبيت يسألك OpenCanvas: هل تحفظ عملك على هذا الجهاز فقط (الخيار الافتراضي)، أم على الجهاز وفي تخزينك السحابي الخاص أيضًا (Cloudflare R2 أو Amazon S3 أو أي خدمة متوافقة مع S3)؟

- **يُحفَظ كل شيء على جهازك أولًا،** فلا ينتظر التطبيق الإنترنت أبدًا.
- **عند وجود الاتصال** تُرفع التعديلات إلى حاويتك خلال ثوانٍ، وتنزل التعديلات القادمة من أجهزتك الأخرى.
- **دون اتصال** تتابع عملك، ويظهر ما لم يُرفع بعد بعلامة «على هذا الجهاز فقط»، ثم يُرفع تلقائيًا حين يعود الاتصال.
- **بعد إعادة التثبيت أو على جهاز جديد** اختر الحاوية نفسها فتعود مكتبتك كاملة: التصاميم والصور والملفات وحزم الهوية والخطوط والإضافات.

**التحقق من البيانات:** يتأكد المثبّت من صحة البيانات بكتابة ملف تجريبي وقراءته وحذفه. وإذا فشل يشرح السبب بوضوح (مفتاح خاطئ، أو حاوية غير موجودة، أو صلاحيات ناقصة، أو عنوان لا يمكن الوصول إليه)، ثم يعرض عليك: المحاولة من جديد، أو تعديل البيانات، أو التخطي والبقاء على هذا الجهاز. ويمكنك ربط السحابة أو تغييرها لاحقًا بالأمر `opencanvas cloud`.

**الأمان:** لا تصل المفاتيح إلى المتصفح أبدًا. يحفظها خادم OpenCanvas المحلي في ملف لا يقرؤه غيرك، وهو الذي يوقّع طلبات S3. ولا تستطيع أي مواقع أخرى استخدام واجهة المزامنة.

**منع التعارض:** إذا عدّلت التصميم نفسه على جهازين قبل المزامنة، تُحفَظ النسختان معًا (الأقدم باسم «… (من جهاز آخر)»)، ولا يكتب جهاز فوق عمل جهاز آخر، لأن كل رفع مشروط بالنسخة التي قورن بها.

</div>

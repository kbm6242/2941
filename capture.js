const { chromium } = require('playwright');
const fs = require('fs');

const hour = process.argv[2];
const isUSTime  = (hour === '7' || hour === '07' || hour === 'all' || hour === 'manual');
const isKRTime  = (hour === '16' || hour === 'all' || hour === 'manual');

// ── 캡처 대상 설정 ──────────────────────────────────────────
const CAPTURES = [
  {
    id: 'sp500',
    name: 'S&P 500',
    // Finviz 히트맵 직접 이미지 URL (Canvas 렌더링 없이 PNG 제공)
    url: 'https://finviz.com/map.ashx?t=sec&mn=snp500&o=-perf1d&width=1600&height=800',
    isImage: true,   // 페이지 캡처 대신 이미지 URL 직접 다운로드
    output: 'images/heatmap_sp500.png',
    runAt: 'US',
  },
  {
    id: 'nasdaq',
    name: 'Nasdaq 100',
    url: 'https://finviz.com/map.ashx?t=sec_etf&mn=nasdaq&o=-perf1d&width=1600&height=800',
    isImage: true,
    output: 'images/heatmap_nasdaq.png',
    runAt: 'US',
  },
  {
    id: 'kospi',
    name: '코스피',
    // 네이버 증권 코스피 시가총액 맵 (스크린샷 방식)
    url: 'https://finance.naver.com/sise/sise_group.naver?type=upjong',
    isImage: false,
    selector: null,
    waitMs: 7000,
    output: 'images/heatmap_kospi.png',
    runAt: 'KR',
  },
];

// ── 이미지 URL 직접 다운로드 ──────────────────────────────
async function downloadImage(config, context) {
  console.log(`\n📥 [${config.name}] 이미지 직접 다운로드...`);
  console.log(`   URL: ${config.url}`);

  const page = await context.newPage();
  try {
    const response = await page.request.get(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://finviz.com/',
        'Accept': 'image/png,image/webp,*/*',
      },
      timeout: 30000,
    });

    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
    }

    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('image')) {
      throw new Error(`예상치 못한 Content-Type: ${contentType}`);
    }

    const buffer = await response.body();
    fs.writeFileSync(config.output, buffer);

    const stats = fs.statSync(config.output);
    console.log(`   ✅ 저장 완료: ${config.output} (${(stats.size / 1024).toFixed(1)} KB)`);
    return true;

  } catch (err) {
    console.error(`   ❌ 다운로드 실패: ${err.message}`);
    return false;
  } finally {
    await page.close();
  }
}

// ── 페이지 스크린샷 방식 ──────────────────────────────────
async function captureScreenshot(config, context) {
  console.log(`\n📸 [${config.name}] 스크린샷 캡처...`);
  console.log(`   URL: ${config.url}`);

  const page = await context.newPage();
  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(config.waitMs || 5000);

    let element = null;
    if (config.selector) {
      try {
        element = await page.waitForSelector(config.selector, { timeout: 8000 });
      } catch {
        console.log(`   ⚠️  선택자 없음, 전체 화면 캡처`);
      }
    }

    const opts = { path: config.output, type: 'png', fullPage: false };
    if (element) {
      await element.screenshot(opts);
    } else {
      await page.screenshot(opts);
    }

    const stats = fs.statSync(config.output);
    console.log(`   ✅ 저장 완료: ${config.output} (${(stats.size / 1024).toFixed(1)} KB)`);
    return true;

  } catch (err) {
    console.error(`   ❌ 스크린샷 실패: ${err.message}`);
    return false;
  } finally {
    await page.close();
  }
}

// ── 메인 실행 ─────────────────────────────────────────────
(async () => {
  console.log('🚀 히트맵 캡처 시작');
  console.log(`   hour=${hour} | US장=${isUSTime} | KR장=${isKRTime}`);

  const targets = CAPTURES.filter(c =>
    (c.runAt === 'US' && isUSTime) ||
    (c.runAt === 'KR' && isKRTime)
  );

  if (targets.length === 0) {
    console.log('⏭️  이 시각에 캡처할 대상 없음, 종료');
    process.exit(0);
  }

  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  let successCount = 0;

  for (const config of targets) {
    let ok = false;
    if (config.isImage) {
      ok = await downloadImage(config, context);
      // 직접 다운로드 실패 시 스크린샷으로 재시도
      if (!ok) {
        console.log(`   🔄 스크린샷 방식으로 재시도...`);
        ok = await captureScreenshot({ ...config, isImage: false, waitMs: 6000 }, context);
      }
    } else {
      ok = await captureScreenshot(config, context);
    }
    if (ok) successCount++;
  }

  await browser.close();

  console.log(`\n🏁 완료: ${successCount}/${targets.length} 성공`);

  // 1개 이상 성공하면 exit 0 (전체 실패 시에만 워크플로우 실패로 표시)
  process.exit(successCount > 0 ? 0 : 1);
})();

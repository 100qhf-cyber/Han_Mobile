package io.github.qhf.hanmobile;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

/**
 * 배포된 PWA 를 그대로 띄우는 WebView 래퍼.
 *
 * 웹 자산을 APK 안에 넣지 않고 GitHub Pages 주소를 부르기 때문에,
 * 웹을 재배포하면 앱을 다시 설치하지 않아도 최신 화면이 나온다.
 * 오프라인은 PWA 의 서비스워커(sw.js)가 그대로 담당한다.
 */
public class MainActivity extends AppCompatActivity {

    /** 배포 주소. 저장소 이름이 바뀌면 여기와 APP_HOST 를 같이 고친다. */
    private static final String START_URL = "https://100qhf-cyber.github.io/Han_Mobile/";
    private static final String APP_HOST  = "100qhf-cyber.github.io";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        web = findViewById(R.id.web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        // localStorage — 앱의 1차 저장소다. 끄면 입차 기록과 아웃박스가 전부 날아간다.
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        // WebChromeClient 가 없으면 WebView 는 confirm()/alert() 를 띄우지 않고
        // 곧바로 false 를 돌려준다 — 출차 처리처럼 confirm 으로 되묻는 동작이 전부 조용히 취소된다.
        // 기본 구현만으로 시스템 대화상자가 뜬다.
        web.setWebChromeClient(new WebChromeClient());

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view,
                                                    @NonNull WebResourceRequest request) {
                Uri uri = request.getUrl();
                // 앱 도메인 안이면 WebView 가 그대로 처리하고, 바깥 링크만 브라우저로 넘긴다.
                if (APP_HOST.equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    return false;
                }
                return true;
            }

            @Override
            public void onReceivedError(@NonNull WebView view,
                                        @NonNull WebResourceRequest request,
                                        @NonNull WebResourceError error) {
                // 서비스워커 캐시가 받아주므로 실패해도 화면은 뜬다. 안내만 한다.
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, R.string.load_failed, Toast.LENGTH_LONG).show();
                }
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}

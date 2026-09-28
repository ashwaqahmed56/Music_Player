# The JS bridge is reached only through @JavascriptInterface methods.
-keepclassmembers class com.ashs.ytbgr.YtWebViewService$JsBridge {
    public *;
}
-keepattributes JavascriptInterface

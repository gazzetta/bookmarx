package com.bookmarx.share

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class ShareReceiverActivity : AppCompatActivity() {
    
    private val scope = CoroutineScope(Dispatchers.Main + Job())
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                if (intent.type == "text/plain") {
                    handleSendText(intent)
                }
            }
        }
    }
    
    private fun handleSendText(intent: Intent) {
        intent.getStringExtra(Intent.EXTRA_TEXT)?.let { sharedText ->
            // Try to extract URL from shared text
            val url = extractUrl(sharedText)
            val title = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: url ?: "Shared Link"
            
            if (url != null) {
                captureBookmark(url, title)
            } else {
                showError("No valid URL found")
                finish()
            }
        } ?: run {
            showError("No content to share")
            finish()
        }
    }
    
    private fun extractUrl(text: String): String? {
        // Simple URL extraction regex
        val urlPattern = Regex("https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+")
        return urlPattern.find(text)?.value
    }
    
    private fun captureBookmark(url: String, title: String) {
        val token = getAuthToken()
        
        if (token == null) {
            showError("Please sign in to BookMarx first")
            finish()
            return
        }
        
        scope.launch {
            try {
                val success = withContext(Dispatchers.IO) {
                    sendCaptureRequest(url, title, token)
                }
                
                if (success) {
                    Toast.makeText(this@ShareReceiverActivity, "Bookmark saved!", Toast.LENGTH_SHORT).show()
                } else {
                    showError("Failed to save bookmark")
                }
            } catch (e: Exception) {
                showError("Error: ${e.message}")
            } finally {
                finish()
            }
        }
    }
    
    private fun sendCaptureRequest(url: String, title: String, token: String): Boolean {
        val apiUrl = URL("http://10.0.2.2:3005/api/v1/capture") // 10.0.2.2 for Android emulator localhost
        
        val connection = apiUrl.openConnection() as HttpURLConnection
        connection.apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("X-Device-ID", "android-share-intent")
            setRequestProperty("X-OS", "Android")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
        }
        
        val body = JSONObject().apply {
            put("url", url)
            put("title", title)
        }
        
        OutputStreamWriter(connection.outputStream).use { writer ->
            writer.write(body.toString())
            writer.flush()
        }
        
        return connection.responseCode == 200
    }
    
    private fun getAuthToken(): String? {
        // Get token from SharedPreferences (shared with main app)
        val prefs = getSharedPreferences("bookmarx_auth", MODE_PRIVATE)
        return prefs.getString("auth_token", null)
    }
    
    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}

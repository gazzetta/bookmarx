import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {
    
    private var sharedURL: URL?
    private var sharedTitle: String?
    
    override func isContentValid() -> Bool {
        return sharedURL != nil
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Configure the navigation bar
        navigationController?.navigationBar.tintColor = UIColor(red: 59/255, green: 130/255, blue: 246/255, alpha: 1)
        
        // Extract shared content
        extractSharedContent()
    }
    
    private func extractSharedContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            return
        }
        
        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            
            for attachment in attachments {
                // Handle URL
                if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] (data, error) in
                        if let url = data as? URL {
                            DispatchQueue.main.async {
                                self?.sharedURL = url
                                self?.sharedTitle = url.host ?? "Shared Link"
                                self?.textView.text = url.absoluteString
                                self?.validateContent()
                            }
                        }
                    }
                }
                // Handle plain text (might contain URL)
                else if attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] (data, error) in
                        if let text = data as? String, let url = URL(string: text), url.scheme != nil {
                            DispatchQueue.main.async {
                                self?.sharedURL = url
                                self?.sharedTitle = "Shared Link"
                                self?.textView.text = text
                                self?.validateContent()
                            }
                        }
                    }
                }
            }
        }
    }
    
    override func didSelectPost() {
        guard let url = sharedURL else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        
        // Get auth token from shared keychain
        let token = getAuthToken()
        
        if let token = token {
            captureBookmark(url: url, title: contentText ?? sharedTitle ?? url.absoluteString, token: token)
        } else {
            // No token - show alert to open main app
            showAuthRequiredAlert()
        }
    }
    
    private func getAuthToken() -> String? {
        // Access shared keychain group
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.bookmarx.auth",
            kSecAttrAccount as String: "auth_token",
            kSecAttrAccessGroup as String: "group.com.bookmarx.shared",
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess, let data = result as? Data {
            return String(data: data, encoding: .utf8)
        }
        
        return nil
    }
    
    private func captureBookmark(url: URL, title: String, token: String) {
        // API endpoint
        guard let apiURL = URL(string: "http://localhost:3005/api/v1/capture") else {
            completeWithError()
            return
        }
        
        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("ios-share-extension", forHTTPHeaderField: "X-Device-ID")
        request.setValue("iOS", forHTTPHeaderField: "X-OS")
        
        let body: [String: Any] = [
            "url": url.absoluteString,
            "title": title
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completeWithError()
            return
        }
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
                } else {
                    self?.completeWithError()
                }
            }
        }
        task.resume()
    }
    
    private func showAuthRequiredAlert() {
        let alert = UIAlertController(
            title: "Sign In Required",
            message: "Please open BookMarx and sign in first.",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        })
        
        present(alert, animated: true)
    }
    
    private func completeWithError() {
        let alert = UIAlertController(
            title: "Error",
            message: "Failed to save bookmark. Please try again.",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        })
        
        present(alert, animated: true)
    }
    
    override func configurationItems() -> [Any]! {
        // To add configuration options via table cells at the bottom of the sheet
        return []
    }
}

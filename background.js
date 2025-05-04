// WebPilot Background Script

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['webpilot_projects', 'openai_api_key'], (result) => {
    // Initialize projects if not exists
    if (!result.webpilot_projects) {
      chrome.storage.local.set({ webpilot_projects: {} });
    }
    
    console.log('WebPilot extension installed and initialized');
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getOpenAIKey') {
    chrome.storage.local.get(['openai_api_key'], (result) => {
      sendResponse({ apiKey: result.openai_api_key || '' });
    });
    return true; // Keep the message channel open for async response
  }
  
  // Handle intro.js injection
  if (message.action === 'injectIntroJs') {
    const tabId = sender.tab.id;
    
    // Inject CSS first
    chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['lib/intro.min.css']
    }).then(() => {
      // Then inject the JS
      return chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['lib/intro.min.js']
      });
    }).then(() => {
      console.log('IntroJs injected successfully');
      sendResponse({ success: true });
    }).catch(err => {
      console.error('Failed to inject IntroJs:', err);
      sendResponse({ success: false, error: err.message });
    });
    
    return true; // Keep the channel open for async response
  }
});

// Handle tab updates to ensure content scripts are loaded
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only continue if the tab has completely loaded
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    // Check if there's a project for this URL
    chrome.storage.local.get(['webpilot_projects'], (result) => {
      const projects = result.webpilot_projects || {};
      if (projects[tab.url]) {
        // Inject content scripts if not already injected
        // This helps with cases where the extension was installed after the page was loaded
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          function: () => {
            // Check if scripts are already injected
            if (!window.webpilotInjected) {
              // Send a message to let the background know scripts need to be injected
              chrome.runtime.sendMessage({ action: 'injectContentScripts', tabId: tabId });
            }
          }
        }).catch(err => console.error('Script injection check failed:', err));
      }
    });
  }
});

// Listen for content script injection requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'injectContentScripts') {
    const tabId = message.tabId;
    
    // Inject CSS first
    chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['content.css']
    }).then(() => {
      // Then inject the JS
      return chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    }).then(() => {
      console.log('Content scripts injected successfully');
      sendResponse({ success: true });
    }).catch(err => {
      console.error('Failed to inject content scripts:', err);
      sendResponse({ success: false, error: err.message });
    });
    
    return true; // Keep the channel open for async response
  }
});
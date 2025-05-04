// Store page HTML and selectors
let pageData = {
  html: '',
  pageUrl: '',
  title: '',
  selectors: []
};

// OpenAI API key
let openAIApiKey = '';

// Create and append modal elements
function createElements() {
  // Create query modal
  const queryModal = document.createElement('div');
  queryModal.id = 'webpilot-query-modal';
  queryModal.classList.add('webpilot-modal', 'webpilot-hidden');
  
  queryModal.innerHTML = `
    <div class="webpilot-modal-content">
      <div class="webpilot-modal-header">
        <h2>WebPilot Walkthrough</h2>
        <span class="webpilot-close">&times;</span>
      </div>
      <div class="webpilot-modal-body">
        <p>Ask a question about how to use this website:</p>
        <textarea id="webpilot-query" placeholder="Example: How do I search for products?"></textarea>
        <button id="webpilot-generate">Generate Walkthrough</button>
        <div id="webpilot-loading" class="webpilot-hidden">
          <span class="webpilot-spinner"></span>
          <p>Generating walkthrough...</p>
        </div>
        <div id="webpilot-error" class="webpilot-hidden"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(queryModal);
  
  // Add event listeners
  const closeBtn = queryModal.querySelector('.webpilot-close');
  closeBtn.addEventListener('click', () => {
    queryModal.classList.add('webpilot-hidden');
  });
  
  const generateBtn = document.getElementById('webpilot-generate');
  generateBtn.addEventListener('click', generateWalkthrough);
  
  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === queryModal) {
      queryModal.classList.add('webpilot-hidden');
    }
  });
}

// Load intro.js resources
function loadIntroJs() {
  return new Promise((resolve, reject) => {
    // Check if intro.js is already loaded
    if (typeof introJs !== 'undefined') {
      resolve();
      return;
    }
    
    try {
      // Mark that we're trying to inject intro.js
      window.webpilotLoadingIntroJs = true;
      
      // Use chrome.runtime.sendMessage to ask background script to inject intro.js
      chrome.runtime.sendMessage({ 
        action: 'injectIntroJs',
        tabId: chrome.runtime.id // This isn't actually the tab ID, but it will be ignored
      }, (response) => {
        if (response && response.success) {
          // Give a small delay for the script to initialize
          setTimeout(() => {
            if (typeof introJs !== 'undefined') {
              resolve();
            } else {
              reject(new Error('IntroJs was injected but not initialized properly'));
            }
          }, 200);
        } else {
          reject(new Error('Failed to inject IntroJs: ' + (response?.error || 'Unknown error')));
        }
      });
    } catch (err) {
      reject(new Error('Error during IntroJs loading: ' + err.message));
    }
  });
}

// Collect page data
function collectPageData() {
  pageData.html = document.documentElement.outerHTML;
  pageData.pageUrl = window.location.href;
  pageData.title = document.title;
  
  // Collect important selectors - but use a more robust approach
  const importantElements = [
    ...document.querySelectorAll('a, button, input, select, textarea, [role="button"]')
  ];
  
  pageData.selectors = importantElements
    .filter(el => {
      // Skip invisible elements
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map(el => {
      // Generate a robust, simple selector for the element
      let selector = '';
      
      // Prioritize ID-based selectors
      if (el.id) {
        selector = `#${el.id}`;
      } 
      // For buttons with text, use the tag name
      else if (el.tagName === 'BUTTON' && el.textContent.trim()) {
        selector = 'button';
      }
      // For links with text, use the tag name
      else if (el.tagName === 'A' && el.textContent.trim()) {
        selector = 'a';
      }
      // For inputs, use tag and type
      else if (el.tagName === 'INPUT' && el.type) {
        selector = `input[type="${el.type}"]`;
      }
      // For other elements, use the tag name
      else {
        selector = el.tagName.toLowerCase();
      }
      
      // Get position information
      const rect = el.getBoundingClientRect();
      
      return {
        selector,
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim() || '',
        type: el.type || '',
        placeholder: el.placeholder || '',
        role: el.getAttribute('role') || '',
        href: el.href || '',
        value: el.value || '',
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left
        },
        // Store a unique attribute to help with identification later
        attributes: {
          id: el.id || '',
          class: el.className || '',
          name: el.name || '',
          placeholder: el.placeholder || '',
          type: el.type || ''
        },
        // Add a visible text description to help identify the element
        description: generateElementDescription(el)
      };
    });
  
  return pageData;
}

// Helper function to generate a human-readable description of an element
function generateElementDescription(element) {
  const tag = element.tagName.toLowerCase();
  const text = element.textContent?.trim() || '';
  let description = `${tag}`;
  
  // Add useful attributes to the description
  if (element.id) description += ` with id "${element.id}"`;
  if (element.type) description += ` of type "${element.type}"`;
  if (element.placeholder) description += ` with placeholder "${element.placeholder}"`;
  if (element.name) description += ` named "${element.name}"`;
  
  // Add text content if it's short enough to be useful
  if (text && text.length < 30) description += ` containing text "${text}"`;
  
  // Add location information
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    description += ` at position (${Math.round(rect.left)},${Math.round(rect.top)})`;
  }
  
  return description;
}

// Function to directly modify the DOM to highlight elements
function modifyDOMForHighlighting(element, stepIndex) {
  if (!element) return null;
  
  // 1. Give the element a unique ID if it doesn't have one
  if (!element.id) {
    element.id = `webpilot-highlight-target-${stepIndex}`;
  }
  
  // 2. Add multiple classes to ensure styling takes effect
  element.classList.add('webpilot-highlighted-element');
  element.classList.add('webpilot-highlight-priority');
  
  // 3. Directly modify the element's style properties 
  const originalStyles = {
    outline: element.style.outline,
    boxShadow: element.style.boxShadow,
    border: element.style.border,
    position: element.style.position,
    zIndex: element.style.zIndex,
    backgroundColor: element.style.backgroundColor
  };
  
  // 4. Apply very aggressive inline styles (these override any CSS rules)
  element.style.outline = '4px solid #ff0000 !important';
  element.style.boxShadow = '0 0 20px #ff0000 !important';
  element.style.border = '2px solid #ff0000 !important';
  
  // 5. Force the element to be visible and on top
  if (element.style.position === 'static' || !element.style.position) {
    element.style.position = 'relative';
  }
  element.style.zIndex = '2147483647'; // Maximum possible z-index
  element.style.backgroundColor = 'rgba(255, 0, 0, 0.1) !important';
  
  // 6. Insert additional content to make the element more noticeable
  const marker = document.createElement('div');
  marker.id = `webpilot-marker-${stepIndex}`;
  marker.style.cssText = `
    position: absolute;
    top: -15px;
    right: -15px;
    width: 30px;
    height: 30px;
    background-color: #ff0000;
    border-radius: 50%;
    color: white;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
    z-index: 2147483647;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  `;
  marker.textContent = stepIndex;
  
  // 7. Add the marker to the element
  if (element.style.position !== 'static') {
    element.appendChild(marker);
  } else {
    // If static positioning, add after the element
    if (element.nextSibling) {
      element.parentNode.insertBefore(marker, element.nextSibling);
    } else {
      element.parentNode.appendChild(marker);
    }
  }
  
  // 8. Define very specific CSS for this element using an inserted stylesheet
  const styleSheet = document.createElement('style');
  styleSheet.id = `webpilot-style-${stepIndex}`;
  styleSheet.textContent = `
    #${element.id} {
      outline: 4px solid #ff0000 !important;
      box-shadow: 0 0 20px #ff0000 !important;
      position: relative !important;
      z-index: 2147483647 !important;
      background-color: rgba(255, 0, 0, 0.1) !important;
    }
    #${element.id}:before {
      content: "";
      position: absolute;
      top: -5px;
      left: -5px;
      right: -5px;
      bottom: -5px;
      border: 2px dashed #ff0000;
      animation: pulse 1.5s infinite;
      pointer-events: none;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.05); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(styleSheet);
  
  // 9. Return a cleanup function
  return function cleanup() {
    // Reset original styles
    element.style.outline = originalStyles.outline;
    element.style.boxShadow = originalStyles.boxShadow;
    element.style.border = originalStyles.border;
    element.style.position = originalStyles.position;
    element.style.zIndex = originalStyles.zIndex;
    element.style.backgroundColor = originalStyles.backgroundColor;
    
    // Remove added classes
    element.classList.remove('webpilot-highlighted-element');
    element.classList.remove('webpilot-highlight-priority');
    
    // Remove marker if it exists
    const marker = document.getElementById(`webpilot-marker-${stepIndex}`);
    if (marker && marker.parentNode) {
      marker.parentNode.removeChild(marker);
    }
    
    // Remove stylesheet
    const styleSheet = document.getElementById(`webpilot-style-${stepIndex}`);
    if (styleSheet && styleSheet.parentNode) {
      styleSheet.parentNode.removeChild(styleSheet);
    }
  };
}

// Function to find an exact element by XPath (much more precise than CSS selectors)
function findElementByXPath(xpath) {
  try {
    return document.evaluate(
      xpath, 
      document, 
      null, 
      XPathResult.FIRST_ORDERED_NODE_TYPE, 
      null
    ).singleNodeValue;
  } catch (e) {
    console.error("XPath error:", e);
    return null;
  }
}

// Function to generate XPath for an element
function getXPathForElement(element) {
  if (!element) return null;
  
  // Try to create a simple but precise XPath
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  let path = '';
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = element.previousSibling;
    
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && 
          sibling.tagName === element.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    
    const tag = element.tagName.toLowerCase();
    const indexSuffix = index ? `[${index + 1}]` : '';
    
    path = `/${tag}${indexSuffix}${path}`;
    element = element.parentNode;
  }
  
  return path;
}

// Function to create an exact highlighter based on XPath
function createExactHighlighter(element, stepIndex) {
  if (!element) return null;
  
  // Store the XPath for this element for later reference
  const xpath = getXPathForElement(element);
  console.log(`XPath for step ${stepIndex}:`, xpath);
  
  // Apply DOM modifications
  return modifyDOMForHighlighting(element, stepIndex);
}

// A function to find "Contact Us" links with extreme precision
function findExactNavigationLink(linkType) {
  const linkTypes = {
    contact: ['contact', 'contact us', 'get in touch', 'reach us'],
    about: ['about', 'about us', 'who we are', 'our story'],
    login: ['login', 'sign in', 'log in', 'signin'],
    signup: ['sign up', 'register', 'join', 'create account']
  };
  
  // Default to contact if not specified
  const searchTerms = linkTypes[linkType?.toLowerCase()] || linkTypes.contact;
  
  // Try different strategies to find the exact link
  
  // 1. Direct ID match
  for (const term of searchTerms) {
    const idSelectors = [
      `#${term.replace(/\s+/g, '')}`,
      `#${term.replace(/\s+/g, '-')}`,
      `#${term.replace(/\s+/g, '_')}`
    ];
    
    for (const selector of idSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && isVisibleElement(element)) return element;
      } catch (e) {}
    }
  }
  
  // 2. Exact text match on link elements
  const allLinks = document.querySelectorAll('a');
  for (const link of Array.from(allLinks)) {
    if (!isVisibleElement(link)) continue;
    
    const linkText = link.textContent.trim().toLowerCase();
    if (searchTerms.includes(linkText)) {
      return link;
    }
  }
  
  // 3. Navigation menu links
  const navSelectors = ['nav', 'header', '.navigation', '.menu', '.navbar'];
  for (const navSelector of navSelectors) {
    try {
      const navElement = document.querySelector(navSelector);
      if (navElement) {
        const navLinks = navElement.querySelectorAll('a');
        for (const link of Array.from(navLinks)) {
          if (!isVisibleElement(link)) continue;
          
          const linkText = link.textContent.trim().toLowerCase();
          for (const term of searchTerms) {
            if (linkText.includes(term)) {
              return link;
            }
          }
        }
      }
    } catch (e) {}
  }
  
  // 4. Data attributes often used for navigation
  for (const term of searchTerms) {
    const dataSelectors = [
      `[data-nav="${term}"]`,
      `[data-page="${term}"]`,
      `[data-section="${term}"]`,
      `[aria-label="${term}"]`
    ];
    
    for (const selector of dataSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && isVisibleElement(element)) return element;
      } catch (e) {}
    }
  }
  
  // 5. Check URLs for navigation patterns
  for (const link of Array.from(allLinks)) {
    if (!isVisibleElement(link)) continue;
    
    const href = link.getAttribute('href')?.toLowerCase() || '';
    for (const term of searchTerms) {
      if (href.includes(term.replace(/\s+/g, '')) || 
          href.includes(term.replace(/\s+/g, '-')) || 
          href.includes(term.replace(/\s+/g, '_'))) {
        return link;
      }
    }
  }
  
  // If all else fails, return the first visible link that contains any of the search terms
  for (const link of Array.from(allLinks)) {
    if (!isVisibleElement(link)) continue;
    
    const linkText = link.textContent.trim().toLowerCase();
    for (const term of searchTerms) {
      if (linkText.includes(term)) {
        return link;
      }
    }
  }
  
  return null;
}

// Helper to check if an element is truly visible
function isVisibleElement(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || 
      style.opacity === '0' || style.width === '0px' || style.height === '0px') {
    return false;
  }
  
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  
  return true;
}

// Helper function to find an element based on description
function findElementForWalkthrough(description) {
  // Try the specialized finder first for common UI elements
  const specialElement = findSpecificElement(description);
  if (specialElement) {
    return specialElement;
  }
  
  // Rest of the function remains the same...
  console.log("Finding element for description:", description);
  
  // Try to directly match by description parts
  if (!description) return null;
  
  // Check if we have an ID
  const idMatch = description.match(/with id "([^"]+)"/);
  if (idMatch && idMatch[1]) {
    const element = document.getElementById(idMatch[1]);
    if (element) {
      console.log("Found element by ID:", idMatch[1], element);
      return element;
    }
  }
  
  // Extract tag from description
  const tagMatch = description.match(/^([a-z]+)/);
  const tag = tagMatch ? tagMatch[1] : null;
  
  if (!tag) {
    // If no tag in description, try to find common UI elements by default
    const commonElements = ['a', 'button', 'input', 'select'];
    for (const tag of commonElements) {
      const elements = Array.from(document.querySelectorAll(tag))
        .filter(el => isVisibleElement(el));
        
      if (elements.length > 0) {
        console.log(`No tag in description, using first visible ${tag}:`, elements[0]);
        return elements[0];
      }
    }
    return null;
  }
  
  // Check if we have text content to match
  const textMatch = description.match(/containing text "([^"]+)"/);
  const text = textMatch ? textMatch[1] : null;
  
  // Check for type attribute
  const typeMatch = description.match(/of type "([^"]+)"/);
  const type = typeMatch ? typeMatch[1] : null;
  
  // Check for placeholder
  const placeholderMatch = description.match(/with placeholder "([^"]+)"/);
  const placeholder = placeholderMatch ? placeholderMatch[1] : null;
  
  // Check for name attribute
  const nameMatch = description.match(/named "([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : null;
  
  // Try to find position
  const positionMatch = description.match(/at position \((\d+),(\d+)\)/);
  const position = positionMatch ? { x: parseInt(positionMatch[1]), y: parseInt(positionMatch[2]) } : null;
  
  // Get all elements of this tag type
  const elements = Array.from(document.getElementsByTagName(tag))
    .filter(el => isVisibleElement(el));
  
  // First try to find element with exact match of all criteria
  for (const el of elements) {
    // Check if element meets all specified criteria
    let matches = true;
    
    if (text && !el.textContent.includes(text)) matches = false;
    if (type && el.getAttribute('type') !== type) matches = false;
    if (placeholder && el.getAttribute('placeholder') !== placeholder) matches = false;
    if (name && el.getAttribute('name') !== name) matches = false;
    
    if (matches) return el;
  }
  
  // Try with more relaxed criteria - just match tag and one other attribute
  for (const el of elements) {
    if (text && el.textContent.includes(text)) return el;
    if (type && el.getAttribute('type') === type) return el;
    if (placeholder && el.getAttribute('placeholder') === placeholder) return el;
    if (name && el.getAttribute('name') === name) return el;
  }
  
  // If position is available, try to find the closest element to that position
  if (position) {
    let closestElement = null;
    let closestDistance = Infinity;
    
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const distance = Math.sqrt(
        Math.pow(centerX - position.x, 2) + 
        Math.pow(centerY - position.y, 2)
      );
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestElement = el;
      }
    }
    
    // Only return if reasonably close (within 100px)
    if (closestDistance < 100 && closestElement) {
      return closestElement;
    }
  }
  
  // If still no match, just return the first visible element of that tag type
  for (const el of elements) {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      return el;
    }
  }
  
  return null;
}

// Function to find specific elements like navigation links
function findSpecificElement(description) {
  console.log("Finding specific element for:", description);
  
  // Check for text clues in the description
  const contactMatch = /contact|reach|email|message/i.test(description);
  const aboutMatch = /about|info|company/i.test(description);
  const loginMatch = /login|sign in|account/i.test(description);
  const signupMatch = /sign up|register|join/i.test(description);
  
  // If looking for contact link specifically
  if (contactMatch || description.toLowerCase().includes('contact')) {
    // Try all possible contact link variations
    const contactSelectors = [
      'a[href*="contact"]', 
      'a:contains("Contact")', 
      'a:contains("CONTACT")',
      '#contact', 
      '.contact',
      'a[href*="mailto"]',
      'nav a:contains("Contact")',
      '[aria-label*="contact"]',
      'header a:contains("Contact")'
    ];
    
    for (const selector of contactSelectors) {
      try {
        // Try exact match first
        const elements = document.querySelectorAll(selector);
        for (const el of Array.from(elements)) {
          if (isVisibleElement(el)) {
            console.log("Found contact element:", el);
            return el;
          }
        }
      } catch (e) {
        // Ignore selector syntax errors
      }
    }
    
    // If no exact match, do a manual search
    const allLinks = Array.from(document.querySelectorAll('a'));
    for (const link of allLinks) {
      if (!isVisibleElement(link)) continue;
      
      const text = link.textContent.trim().toLowerCase();
      const href = (link.getAttribute('href') || '').toLowerCase();
      const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
      
      // Check for any contact-related terms
      if (text.includes('contact') || 
          href.includes('contact') || 
          ariaLabel.includes('contact') ||
          text.includes('get in touch') ||
          text === 'contact us') {
        console.log("Found contact link by text/attributes:", link);
        return link;
      }
    }
  }
  
  // If description mentions clicking a specific link
  const linkMatch = description.match(/click on.*["'](.+?)["']/i);
  if (linkMatch && linkMatch[1]) {
    const linkText = linkMatch[1].trim();
    console.log("Looking for link with text:", linkText);
    
    // Find link by exact text
    const allLinks = Array.from(document.querySelectorAll('a'));
    for (const link of allLinks) {
      if (!isVisibleElement(link)) continue;
      
      const text = link.textContent.trim();
      if (text === linkText || 
          text.toLowerCase() === linkText.toLowerCase() ||
          text.includes(linkText) ||
          linkText.includes(text)) {
        console.log("Found link by text match:", link);
        return link;
      }
    }
  }
  
  // Try to extract quoted text from description
  const quotedTextMatch = description.match(/['"]([^'"]+)['"]/);
  if (quotedTextMatch && quotedTextMatch[1]) {
    const quotedText = quotedTextMatch[1].trim();
    console.log("Looking for element with quoted text:", quotedText);
    
    // Try to find elements with this text
    const allElements = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]');
    for (const el of Array.from(allElements)) {
      if (!isVisibleElement(el)) continue;
      
      const text = el.textContent.trim();
      if (text === quotedText || 
          text.toLowerCase() === quotedText.toLowerCase() ||
          text.includes(quotedText) ||
          quotedText.includes(text)) {
        console.log("Found element by quoted text:", el);
        return el;
      }
    }
  }
  
  // If we're still here, fall back to the main element finder
  return null;
}

// Enhanced function to find elements with contextual understanding
function findElementWithContext(description, stepContext) {
  console.log("Finding element with context:", description, stepContext);
  
  // Extract key terms from the description and context
  const descriptionLower = description?.toLowerCase() || '';
  const contextLower = stepContext?.toLowerCase() || '';
  
  // Special cases based on common website elements
  
  // Case: Looking for a navigation link like "Messaging" on LinkedIn
  if ((descriptionLower.includes('messaging') || contextLower.includes('messaging')) && 
      (contextLower.includes('click') || contextLower.includes('open'))) {
    
    // Try precise path with text content matching
    const allNavLinks = Array.from(document.querySelectorAll('nav a, header a, [role="navigation"] a, .nav-item, [aria-label*="navigation"] a, [aria-label*="menu"] a'));
    
    // Try looking for exact "Messaging" text
    for (const link of allNavLinks) {
      if (!isVisibleElement(link)) continue;
      
      const linkText = link.textContent.trim();
      const ariaLabel = link.getAttribute('aria-label') || '';
      
      if (linkText.toLowerCase() === 'messaging' || ariaLabel.toLowerCase() === 'messaging') {
        console.log("Found exact Messaging link:", link);
        return link;
      }
    }
    
    // Try looking for main navigation with messaging icon
    try {
      // LinkedIn specific selectors
      const linkedInSelectors = [
        'a[href="/messaging/"]',
        'a[data-test-app-aware-link="messaging"]',
        'a[href*="messaging"]',
        '[data-control-name="messaging"]',
        'nav li a[href*="messaging"]',
        'a[aria-label*="Messaging"]',
        // Iconic class patterns on LinkedIn
        '.messaging-tab',
        '.msg-overlay-bubble-header',
        '.global-nav__primary-link[href*="messaging"]'
      ];
      
      for (const selector of linkedInSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of Array.from(elements)) {
            if (isVisibleElement(el)) {
              console.log("Found LinkedIn messaging element:", el);
              return el;
            }
          }
        } catch(e) {}
      }
      
      // Look for elements containing "message" icons
      const messageIcons = document.querySelectorAll('[data-icon-name="message"], [aria-label*="message"], [title*="message"]');
      for (const icon of Array.from(messageIcons)) {
        // Find the closest clickable parent
        let parent = icon;
        while (parent && !parent.tagName.match(/^(A|BUTTON)$/i) && !parent.getAttribute('role')?.match(/button/i)) {
          parent = parent.parentElement;
          if (!parent || parent === document.body) break;
        }
        
        if (parent && parent.tagName.match(/^(A|BUTTON)$/i) && isVisibleElement(parent)) {
          console.log("Found message icon parent:", parent);
          return parent;
        }
      }
    } catch (e) {
      console.error("Error finding LinkedIn messaging:", e);
    }
    
    // More general approach - look for any visible element containing "messaging" text
    const allElements = document.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      if (!isVisibleElement(el)) continue;
      
      const text = el.textContent.trim().toLowerCase();
      if (text === 'messaging' || text === 'messages') {
        // Find closest clickable
        let clickable = el;
        while (clickable && !clickable.tagName.match(/^(A|BUTTON)$/i) && !clickable.getAttribute('role')?.match(/button/i)) {
          clickable = clickable.parentElement;
          if (!clickable || clickable === document.body) break;
        }
        
        if (clickable && clickable.tagName.match(/^(A|BUTTON)$/i)) {
          console.log("Found general messaging element:", clickable);
          return clickable;
        }
        
        console.log("Found text-matching element:", el);
        return el;
      }
    }
  }
  
  // Look for specific LinkedIn main navigation items
  if ((descriptionLower.includes('jobs') && contextLower.includes('click')) ||
      (descriptionLower.includes('jobs tab') || contextLower.includes('jobs tab'))) {
    
    const jobsSelectors = [
      'a[href="/jobs/"]',
      'a[data-test-app-aware-link="jobs"]',
      'a[href*="jobs"]',
      '[data-control-name="jobs"]',
      'nav li a[href*="jobs"]',
      'a[aria-label*="Jobs"]'
    ];
    
    for (const selector of jobsSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of Array.from(elements)) {
          if (isVisibleElement(el) && el.textContent.trim().toLowerCase().includes('job')) {
            console.log("Found LinkedIn jobs element:", el);
            return el;
          }
        }
      } catch(e) {}
    }
  }
  
  // Look for specific LinkedIn icons or primary navigation items
  if (descriptionLower.includes('icon') || descriptionLower.includes('tab') || 
      descriptionLower.includes('menu') || descriptionLower.includes('navigation')) {
    
    // Check for primary navigation based on position and structure
    // LinkedIn has a consistent navigation bar at the top
    const topNavLinks = [];
    
    // Collect all navigation links at the top of the page
    document.querySelectorAll('nav a, [role="navigation"] a, header a').forEach(link => {
      if (!isVisibleElement(link)) return;
      
      const rect = link.getBoundingClientRect();
      // Only consider elements in the top portion of the page
      if (rect.top < 100) {
        topNavLinks.push({
          element: link,
          text: link.textContent.trim().toLowerCase(),
          left: rect.left
        });
      }
    });
    
    // Sort by horizontal position to understand the layout
    topNavLinks.sort((a, b) => a.left - b.left);
    
    // Extract the navigation item mentioned in the description
    const navigationTerms = [
      {term: 'home', alternatives: ['homepage', 'main page', 'feed']},
      {term: 'my network', alternatives: ['network', 'connections', 'people']},
      {term: 'jobs', alternatives: ['job', 'career', 'work', 'employment']},
      {term: 'messaging', alternatives: ['message', 'chat', 'inbox']},
      {term: 'notifications', alternatives: ['alerts', 'notice']},
      {term: 'me', alternatives: ['profile', 'account', 'my account']}
    ];
    
    // Find which navigation item is being referenced
    let targetNavTerm = null;
    for (const navTerm of navigationTerms) {
      if (descriptionLower.includes(navTerm.term)) {
        targetNavTerm = navTerm.term;
        break;
      }
      
      for (const alt of navTerm.alternatives) {
        if (descriptionLower.includes(alt)) {
          targetNavTerm = navTerm.term;
          break;
        }
      }
      
      if (targetNavTerm) break;
    }
    
    // If we found a matching navigation term, find the corresponding element
    if (targetNavTerm) {
      for (const navLink of topNavLinks) {
        if (navLink.text.includes(targetNavTerm) || 
            (navLink.element.getAttribute('aria-label')?.toLowerCase() || '').includes(targetNavTerm)) {
          console.log(`Found "${targetNavTerm}" navigation item:`, navLink.element);
          return navLink.element;
        }
      }
    }
  }
  
  // Return null to indicate we couldn't find a specific element with context
  return null;
}

// Helper function to apply a visually striking highlight for tooltips
function applyTooltipHighlight(element, stepNumber) {
  if (!element) return null;
  
  // Store original element state for cleanup
  const originalStyles = {
    outline: element.style.outline,
    boxShadow: element.style.boxShadow,
    background: element.style.background,
    backgroundColor: element.style.backgroundColor,
    position: element.style.position,
    zIndex: element.style.zIndex
  };
  
  // Try to find the exact element for tooltips in navigation
  let targetElement = element;
  
  // If it's inside a list item or navigation structure, try to isolate just the right element
  if (element.closest('li') && (element.closest('nav') || element.closest('[role="navigation"]'))) {
    // For navigation items, try to find the most specific clickable element
    const possibleTargets = element.querySelectorAll('a, button');
    if (possibleTargets.length === 1) {
      targetElement = possibleTargets[0];
    } else if (element.tagName === 'A' || element.tagName === 'BUTTON') {
      targetElement = element;
    } else if (element.querySelector('a')) {
      targetElement = element.querySelector('a');
    }
  }
  
  // Apply very strong styling directly to the element
  // Use !important to override site styles
  targetElement.style.outline = '3px solid #ff0000 !important';
  targetElement.style.boxShadow = '0 0 15px #ff0000 !important';
  targetElement.style.position = 'relative';
  targetElement.style.zIndex = '2147483647'; // Max z-index
  
  // Add subtle background change
  const computedBg = window.getComputedStyle(targetElement).backgroundColor;
  if (computedBg === 'transparent' || computedBg === 'rgba(0, 0, 0, 0)') {
    targetElement.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
  }
  
  // Add a marker element to clearly show the step number
  const marker = document.createElement('div');
  marker.id = `webpilot-marker-${stepNumber}`;
  marker.innerHTML = stepNumber.toString();
  marker.style.cssText = `
    position: absolute;
    top: -10px;
    right: -10px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: #ff0000;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
    font-family: Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
    z-index: 2147483647;
    pointer-events: none;
  `;
  
  // Make sure the target element can have the marker attached
  if (targetElement.style.position === 'static') {
    targetElement.style.position = 'relative';
  }
  
  // Append marker to element or its parent
  if (targetElement.tagName === 'IMG' || targetElement.tagName === 'INPUT') {
    // Images and inputs can't have children, so add marker to parent
    targetElement.parentElement.appendChild(marker);
    marker.style.position = 'absolute';
    const rect = targetElement.getBoundingClientRect();
    marker.style.top = `${rect.top}px`;
    marker.style.left = `${rect.left + rect.width - 10}px`;
  } else {
    // Append to the element itself
    targetElement.appendChild(marker);
  }
  
  // Add pulsing animation via a stylesheet
  const styleElement = document.createElement('style');
  styleElement.id = `webpilot-style-${stepNumber}`;
  styleElement.textContent = `
    @keyframes webpilot-pulse-${stepNumber} {
      0% { outline-color: rgba(255, 0, 0, 1); box-shadow: 0 0 15px rgba(255, 0, 0, 0.8); }
      50% { outline-color: rgba(255, 0, 0, 0.5); box-shadow: 0 0 15px rgba(255, 0, 0, 0.3); }
      100% { outline-color: rgba(255, 0, 0, 1); box-shadow: 0 0 15px rgba(255, 0, 0, 0.8); }
    }
    #${targetElement.id || `webpilot-highlight-${stepNumber}`} {
      animation: webpilot-pulse-${stepNumber} 1.5s infinite;
    }
  `;
  
  document.head.appendChild(styleElement);
  
  // If the element doesn't have an ID, add one
  if (!targetElement.id) {
    targetElement.id = `webpilot-highlight-${stepNumber}`;
  }
  
  // Return function to clean up
  return function() {
    // Reset original styles
    targetElement.style.outline = originalStyles.outline;
    targetElement.style.boxShadow = originalStyles.boxShadow;
    targetElement.style.background = originalStyles.background;
    targetElement.style.backgroundColor = originalStyles.backgroundColor;
    
    // Only reset position and z-index if we changed them
    if (originalStyles.position) {
      targetElement.style.position = originalStyles.position;
    }
    if (originalStyles.zIndex) {
      targetElement.style.zIndex = originalStyles.zIndex;
    }
    
    // Remove marker
    if (marker.parentNode) {
      marker.parentNode.removeChild(marker);
    }
    
    // Remove style element
    if (styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
  };
}

// Improved startWalkthrough function with direct DOM modification
// Optimized startWalkthrough function with context-aware element finding
function startWalkthrough(walkthroughData) {
  // Make sure intro.js is available
  if (typeof introJs === 'undefined') {
    console.error('WebPilot Error: intro.js is not loaded');
    showError('Failed to load intro.js. Please try again.');
    return;
  }
  
  console.log("Starting walkthrough with data:", walkthroughData);
  
  // Clean up any existing highlights
  cleanupExistingHighlights();
  
  // Store cleanup functions for DOM modifications
  const cleanupFunctions = [];
  
  // Configure the intro
  const intro = introJs();
  
  // Prepare steps for intro.js
  const steps = [];
  
  // Analyze the steps to understand the overall context of the walkthrough
  const walkthrough = {
    isNavigation: false,
    isForm: false,
    isClickSequence: false,
    mainAction: '',
    platformContext: detectPlatformContext(),
    userIntent: detectUserIntent(walkthroughData)
  };
  
  console.log("Detected walkthrough context:", walkthrough);
  
  // Add title as the first step if provided
  if (walkthroughData.title) {
    // For the title, just use body to avoid issues
    steps.push({
      element: document.querySelector('body'),
      intro: `<h3>${walkthroughData.title}</h3><p>Follow these steps to complete your task:</p>`,
      position: 'bottom'
    });
  }
  
  // Process each step
  walkthroughData.steps.forEach((step, index) => {
    try {
      // Generate a combined context for the step
      const stepContext = step.intro || '';
      
      let targetElement = null;
      
      // Try context-aware element finding first
      if (step.elementDescription || step.intro) {
        targetElement = findElementWithContext(
          step.elementDescription || '', 
          step.intro || '',
          // Additional context
          {
            stepNumber: index + 1,
            totalSteps: walkthroughData.steps.length,
            platformContext: walkthrough.platformContext,
            userIntent: walkthrough.userIntent
          }
        );
      }
      
      // If context-aware finding didn't work, try traditional methods
      if (!targetElement) {
        // Try specialized finders based on element description
        if (step.elementDescription) {
          if (step.elementDescription.toLowerCase().includes('messaging')) {
            targetElement = findSpecificNavigationElement('messaging');
          }
          else if (step.elementDescription.toLowerCase().includes('jobs')) {
            targetElement = findSpecificNavigationElement('jobs');
          }
          else if (step.elementDescription.toLowerCase().includes('home')) {
            targetElement = findSpecificNavigationElement('home');
          }
          else if (step.elementDescription.toLowerCase().includes('network')) {
            targetElement = findSpecificNavigationElement('network');
          }
          else if (step.elementDescription.toLowerCase().includes('notification')) {
            targetElement = findSpecificNavigationElement('notifications');
          }
          else if (step.elementDescription.toLowerCase().includes('profile') || 
                  step.elementDescription.toLowerCase().includes('me')) {
            targetElement = findSpecificNavigationElement('profile');
          }
          else {
            targetElement = findElementForWalkthrough(step.elementDescription);
          }
        }
      }
      
      // If we have a DOM element reference, use it directly
      if (!targetElement && step.domElement) {
        targetElement = step.domElement;
      }
      
      // If we found an element, add the step and apply highlighting
      if (targetElement) {
        console.log(`Found element for step ${index + 1}:`, targetElement);
        
        // Apply targeted highlighting based on element type
        const cleanup = applyTooltipHighlight(targetElement, index + 1);
        if (cleanup) {
          cleanupFunctions.push(cleanup);
        }
        
        // Add to intro.js steps
        steps.push({
          element: targetElement,
          intro: step.intro,
          position: determineOptimalPosition(targetElement, step.position)
        });
      } else {
        console.warn(`Could not find element for step ${index + 1}:`, step);
        // Create a floating notice as fallback
        const floatingStep = createFloatingStep(step.intro, index + 1);
        if (floatingStep) {
          steps.push(floatingStep);
        }
      }
    } catch (e) {
      console.error(`Error processing step ${index + 1}:`, e);
    }
  });
  
  // Make sure we have steps
  if (steps.length <= 1) {
    showError('Could not find elements for walkthrough. Please try a different query.');
    return;
  }
  
  // Add custom CSS for intro.js and our highlights
  addCustomStyles();
  
  // Configure intro.js
  intro.setOptions({
    steps: steps,
    showBullets: true,
    showProgress: true,
    exitOnOverlayClick: false,
    disableInteraction: false,
    tooltipClass: 'webpilot-tooltip',
    highlightClass: 'webpilot-highlight-important',
    doneLabel: 'Finish',
    nextLabel: 'Next →',
    prevLabel: '← Back',
    skipLabel: 'Skip',
    hidePrev: false,
    hideNext: false,
    scrollTo: 'element',
    scrollPadding: 30
  });
  
  // Handle events
  intro.onbeforechange(function(targetElement) {
    console.log("Moving to element:", targetElement);
    
    // Clean up previous DOM modifications
    for (const cleanup of cleanupFunctions) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    }
    cleanupFunctions.length = 0;
    
    // Find the current step index
    const currentStepIndex = intro._currentStep + 1;
    
    // Apply new DOM modifications for this element
    if (targetElement && targetElement !== document.body) {
      // For tooltips and guidance, use the specialized highlighting
      const cleanup = applyTooltipHighlight(targetElement, currentStepIndex);
      if (cleanup) {
        cleanupFunctions.push(cleanup);
      }
      
      // Scroll to element
      setTimeout(() => {
        targetElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center'
        });
      }, 100);
    }
  });
  
  // Clean up on exit
  intro.onexit(function() {
    // Clean up all DOM modifications
    for (const cleanup of cleanupFunctions) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    }
    cleanupFunctions.length = 0;
    
    // Remove any floating steps
    document.querySelectorAll('.webpilot-floating-step').forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });
  
  // Clean up on complete
  intro.oncomplete(function() {
    // Clean up all DOM modifications
    for (const cleanup of cleanupFunctions) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    }
    cleanupFunctions.length = 0;
    
    // Show completion message
    showCompletionMessage();
  });
  
  // Start the walkthrough
  setTimeout(() => {
    try {
      intro.start();
    } catch (e) {
      console.error('Error starting intro.js:', e);
      showError('Failed to start walkthrough: ' + e.message);
    }
  }, 500);
  
  return intro;
}

// Helper function to determine the optimal tooltip position
function determineOptimalPosition(element, preferredPosition) {
  if (!element) return 'bottom';
  
  if (preferredPosition) return preferredPosition;
  
  // Get element position relative to viewport
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;
  
  // Check if element is closer to top or bottom
  const topSpace = rect.top;
  const bottomSpace = windowHeight - rect.bottom;
  const leftSpace = rect.left;
  const rightSpace = windowWidth - rect.right;
  
  // Determine best position based on available space
  const maxSpace = Math.max(topSpace, bottomSpace, leftSpace, rightSpace);
  
  if (maxSpace === topSpace) return 'top';
  if (maxSpace === bottomSpace) return 'bottom';
  if (maxSpace === leftSpace) return 'left';
  if (maxSpace === rightSpace) return 'right';
  
  // Default to bottom if all else fails
  return 'bottom';
}

// Function to detect the platform/website context
function detectPlatformContext() {
  const url = window.location.href;
  const title = document.title;
  
  // Check for common platforms
  if (url.includes('linkedin.com')) {
    return 'linkedin';
  } else if (url.includes('facebook.com')) {
    return 'facebook';
  } else if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'twitter';
  } else if (url.includes('gmail.com')) {
    return 'gmail';
  } else if (url.includes('amazon.com')) {
    return 'amazon';
  } else if (url.includes('google.com')) {
    return 'google';
  }
  
  // Try to detect based on meta tags, page structure etc.
  if (document.querySelector('meta[name="application-name"][content="LinkedIn"]')) {
    return 'linkedin';
  }
  
  return 'unknown';
}

// Function to detect the overall intent of the walkthrough
function detectUserIntent(walkthroughData) {
  const title = walkthroughData.title || '';
  const stepsText = walkthroughData.steps.map(s => s.intro || '').join(' ');
  const allText = title + ' ' + stepsText;
  
  // Check for common intents
  if (/message|messaging|chat|send.+message/i.test(allText)) {
    return 'messaging';
  } else if (/job|career|apply|application/i.test(allText)) {
    return 'job-search';
  } else if (/search|find|look.+for/i.test(allText)) {
    return 'search';
  } else if (/post|create|publish|share/i.test(allText)) {
    return 'create-content';
  } else if (/profile|edit.+profile|update.+profile/i.test(allText)) {
    return 'profile-management';
  } else if (/connect|connection|network|follow/i.test(allText)) {
    return 'networking';
  } else if (/settings|privacy|security|account/i.test(allText)) {
    return 'account-management';
  }
  
  return 'general-navigation';
}

// Function to find specific navigation elements with platform awareness
function findSpecificNavigationElement(elementType) {
  const platform = detectPlatformContext();
  
  if (platform === 'linkedin') {
    // LinkedIn-specific element finding
    switch(elementType.toLowerCase()) {
      case 'messaging':
        try {
          // Try the most reliable and specific selectors first
          const messagingSelectors = [
            'a[href="/messaging/"]',
            'a[data-test-global-nav-link="messaging"]',
            'a.global-nav__primary-link[href*="messaging"]',
            '[aria-label="Messaging"]',
            'nav a[href*="messaging"]'
          ];
          
          for (const selector of messagingSelectors) {
            const el = document.querySelector(selector);
            if (el && isVisibleElement(el)) return el;
          }
          
          // If specific selectors fail, try a more general approach
          const navItems = document.querySelectorAll('nav a, nav button, [role="navigation"] a');
          for (const item of Array.from(navItems)) {
            if (!isVisibleElement(item)) continue;
            
            if (item.textContent.trim().toLowerCase() === 'messaging' || 
                (item.getAttribute('aria-label') || '').toLowerCase().includes('messag')) {
              return item;
            }
          }
        } catch (e) {
          console.error("Error finding LinkedIn messaging:", e);
        }
        break;
        
      case 'jobs':
        try {
          const jobsSelectors = [
            'a[href="/jobs/"]',
            'a[data-test-global-nav-link="jobs"]',
            'a.global-nav__primary-link[href*="jobs"]',
            '[aria-label="Jobs"]',
            'nav a[href*="jobs"]'
          ];
          
          for (const selector of jobsSelectors) {
            const el = document.querySelector(selector);
            if (el && isVisibleElement(el)) return el;
          }
        } catch (e) {
          console.error("Error finding LinkedIn jobs:", e);
        }
        break;
        
      // Add cases for other LinkedIn navigation elements
    }
  }
  
  // Generic approach if platform-specific approach fails
  return findExactNavigationLink(elementType);
}

// Helper function to clean up any existing highlights
function cleanupExistingHighlights() {
  // Remove marker elements
  document.querySelectorAll('[id^="webpilot-marker-"]').forEach(el => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Remove style elements
  document.querySelectorAll('[id^="webpilot-style-"]').forEach(el => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Remove floating steps
  document.querySelectorAll('.webpilot-floating-step').forEach(el => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Remove highlight classes
  document.querySelectorAll('.webpilot-highlighted-element, .webpilot-highlight-priority').forEach(el => {
    el.classList.remove('webpilot-highlighted-element');
    el.classList.remove('webpilot-highlight-priority');
    
    // Reset important inline styles
    el.style.outline = '';
    el.style.boxShadow = '';
    el.style.border = '';
    el.style.backgroundColor = '';
  });
}

// Helper function to add custom styles
function addCustomStyles() {
  const customStyles = document.createElement('style');
  customStyles.id = 'webpilot-custom-styles';
  customStyles.textContent = `
    .webpilot-tooltip.introjs-tooltip {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 5px 30px rgba(0, 0, 0, 0.5);
      padding: 15px;
      max-width: 400px;
      z-index: 10000000;
      border: 2px solid #ff0000;
    }
    .webpilot-highlight-important {
      z-index: 9999999 !important;
      position: relative !important;
      box-shadow: 0 0 20px #ff0000 !important;
      outline: 3px solid #ff0000 !important;
      background-color: rgba(255, 0, 0, 0.1) !important;
    }
    .introjs-helperNumberLayer {
      background: #ff0000;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      font-family: Arial, sans-serif;
      font-weight: bold;
    }
    .introjs-tooltip * {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    }
    .introjs-button {
      background-color: #ff0000;
      color: white;
      border: none;
      box-shadow: none;
      text-shadow: none;
      padding: 8px 15px;
      border-radius: 4px;
      font-weight: 600;
      transition: background-color 0.3s;
    }
    .introjs-button:hover {
      background-color: #cc0000;
    }
    .webpilot-floating-step {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 20px;
      background-color: white;
      border: 3px solid #ff0000;
      border-radius: 8px;
      box-shadow: 0 5px 30px rgba(0, 0, 0, 0.5);
      z-index: 9999999;
      max-width: 400px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    }
  `;
  
  // Remove existing custom styles if they exist
  const existingStyles = document.getElementById('webpilot-custom-styles');
  if (existingStyles && existingStyles.parentNode) {
    existingStyles.parentNode.removeChild(existingStyles);
  }
  
  document.head.appendChild(customStyles);
}

// Helper function to create a floating step for elements we can't find
function createFloatingStep(text, index) {
  const floatingStep = document.createElement('div');
  floatingStep.className = 'webpilot-floating-step';
  floatingStep.id = `webpilot-floating-step-${index}`;
  floatingStep.innerHTML = `
    <div style="font-weight: bold; font-size: 18px; margin-bottom: 10px;">Step ${index}</div>
    <div>${text}</div>
  `;
  document.body.appendChild(floatingStep);
  
  // Return a step object for intro.js
  return {
    element: floatingStep,
    intro: text,
    position: 'bottom'
  };
}

// Helper function to show completion message
function showCompletionMessage() {
  const completionMsg = document.createElement('div');
  completionMsg.style.position = 'fixed';
  completionMsg.style.bottom = '20px';
  completionMsg.style.right = '20px';
  completionMsg.style.backgroundColor = 'rgba(46, 204, 113, 0.9)';
  completionMsg.style.color = 'white';
  completionMsg.style.padding = '15px 20px';
  completionMsg.style.borderRadius = '4px';
  completionMsg.style.zIndex = '999999';
  completionMsg.style.fontFamily = 'Arial, sans-serif';
  completionMsg.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  completionMsg.textContent = 'Walkthrough completed! Click the WebPilot icon if you need more help.';
  document.body.appendChild(completionMsg);
  
  // Remove after 5 seconds
  setTimeout(() => {
    completionMsg.style.opacity = '0';
    completionMsg.style.transition = 'opacity 0.5s';
    setTimeout(() => completionMsg.remove(), 500);
  }, 5000);
}

// Generate walkthrough using OpenAI API
async function generateWalkthrough() {
  const queryText = document.getElementById('webpilot-query').value.trim();
  if (!queryText) {
    showError('Please enter a question.');
    return;
  }
  
  if (!openAIApiKey) {
    showError('OpenAI API key is missing. Please set it in the WebPilot extension popup.');
    return;
  }
  
  // Show loading state
  const loadingEl = document.getElementById('webpilot-loading');
  const errorEl = document.getElementById('webpilot-error');
  const generateBtn = document.getElementById('webpilot-generate');
  
  loadingEl.classList.remove('webpilot-hidden');
  errorEl.classList.add('webpilot-hidden');
  generateBtn.disabled = true;
  
  try {
    // Load intro.js if not already loaded
    await loadIntroJs();
    
    // Retrieve saved page data from storage if it exists
    let currentPageData = pageData;
    
    // If pageData is empty, try to get it from storage
    if (!currentPageData.html || !currentPageData.selectors.length) {
      try {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(['webpilot_current_page'], (data) => {
            resolve(data);
          });
        });
        
        if (result.webpilot_current_page && 
            result.webpilot_current_page.url === window.location.href) {
          currentPageData = result.webpilot_current_page.data;
        } else {
          // If no stored data for current URL, collect it now
          currentPageData = collectPageData();
        }
      } catch (err) {
        console.error('Failed to retrieve page data from storage:', err);
        // Collect data as fallback
        currentPageData = collectPageData();
      }
    }
    
    // Create a simplified version of selectors for the prompt
    const simplifiedSelectors = currentPageData.selectors.map(selector => {
      return {
        description: selector.description,
        tag: selector.tag,
        text: selector.text,
        type: selector.type,
        placeholder: selector.placeholder,
        role: selector.role
      };
    }).slice(0, 50); // Limit to 50 elements to avoid token limits
    
    const prompt = `
      I need to create a walkthrough for a website.
      
      Website URL: ${currentPageData.pageUrl || window.location.href}
      Website Title: ${currentPageData.title || document.title}
      
      User's query: "${queryText}"
      
      Here are descriptions of important interactive elements on the page:
      ${JSON.stringify(simplifiedSelectors, null, 2)}
      
      Please create a step-by-step walkthrough that directly answers the user's query.
      
      DO NOT USE CSS SELECTORS in your response. Instead, describe each element clearly so we can find it on the page.
      
      Format your response as JSON with the following structure:
      {
        "title": "Walkthrough title",
        "steps": [
          {
            "elementDescription": "Detailed description of the element including tag type, text content, attributes etc.",
            "intro": "Instruction text for this step",
            "position": "top", "bottom", "left", or "right"
          },
          ...more steps
        ]
      }
      
      IMPORTANT GUIDELINES:
      1. In the elementDescription field, include clear descriptions like 'button containing text "Sign up"' or 'input of type "email" with placeholder "Enter email"'
      2. Do NOT include any CSS selectors, class names, or complex HTML paths
      3. Make sure each step is clear and specific
      4. Position tooltips where they won't be cut off by screen edges
      5. Keep the walkthrough focused on the user's specific query
      6. Keep the number of steps between 2-6 for better user experience
      7. Ensure the steps follow a logical sequence
      8. Return JSON only with no markdown or explanations
    `;
    
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates step-by-step walkthroughs for websites. Return ONLY valid JSON without any markdown formatting, code blocks, or additional text. DO NOT include any CSS selectors in your response.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5, // Lower temperature for more predictable outputs
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate walkthrough');
    }
    
    const data = await response.json();
    
    try {
      // Clean the response to remove any markdown formatting that might be present
      let jsonContent = data.choices[0].message.content;
      
      // Remove any markdown code block indicators if present
      jsonContent = jsonContent.replace(/```json\s*/g, '');
      jsonContent = jsonContent.replace(/```\s*$/g, '');
      jsonContent = jsonContent.trim();
      
      // Parse the cleaned JSON
      const walkthroughData = JSON.parse(jsonContent);
      
      // Validate the JSON response
      if (!walkthroughData.steps || !Array.isArray(walkthroughData.steps)) {
        throw new Error('Invalid walkthrough format: missing steps array');
      }
      
      // Start the intro.js walkthrough
      startWalkthrough(walkthroughData);
      
      // Hide the query modal
      document.getElementById('webpilot-query-modal').classList.add('webpilot-hidden');
    } catch (jsonError) {
      console.error('Failed to parse OpenAI response:', jsonError);
      throw new Error('Failed to parse walkthrough data: ' + jsonError.message);
    }
  } catch (error) {
    console.error('WebPilot Error:', error);
    showError(error.message || 'Failed to generate walkthrough.');
  } finally {
    loadingEl.classList.add('webpilot-hidden');
    generateBtn.disabled = false;
  }
}

// Show error message
function showError(message) {
  const errorEl = document.getElementById('webpilot-error');
  errorEl.textContent = message;
  errorEl.classList.remove('webpilot-hidden');
}

// Toggle query modal
function toggleQueryModal() {
  const modal = document.getElementById('webpilot-query-modal');
  if (modal.classList.contains('webpilot-hidden')) {
    modal.classList.remove('webpilot-hidden');
  } else {
    modal.classList.add('webpilot-hidden');
  }
}

// Create project
function createProject(apiKey) {
  openAIApiKey = apiKey;
  
  // Only create elements if they don't exist
  if (!document.getElementById('webpilot-query-modal')) {
    createElements();
  }
  
  // Collect page data and show loading state
  const loadingEl = document.createElement('div');
  loadingEl.id = 'webpilot-collect-loading';
  loadingEl.style.position = 'fixed';
  loadingEl.style.top = '20px';
  loadingEl.style.right = '20px';
  loadingEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  loadingEl.style.color = 'white';
  loadingEl.style.padding = '10px 15px';
  loadingEl.style.borderRadius = '4px';
  loadingEl.style.zIndex = '999999';
  loadingEl.style.fontFamily = 'Arial, sans-serif';
  loadingEl.innerHTML = 'Collecting page data... <span class="webpilot-spinner" style="display: inline-block; width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; margin-left: 5px; animation: webpilot-spin 1s linear infinite;"></span>';
  document.body.appendChild(loadingEl);
  
  // Use setTimeout to allow the UI to update before starting the potentially heavy operation
  setTimeout(() => {
    try {
      // Collect the page data
      collectPageData();
      
      // Save the data to local storage
      chrome.storage.local.set({ 
        'webpilot_current_page': {
          url: window.location.href,
          data: pageData
        }
      }, () => {
        // Remove loading message
        loadingEl.remove();
        
        // Show success message
        const successEl = document.createElement('div');
        successEl.style.position = 'fixed';
        successEl.style.top = '20px';
        successEl.style.right = '20px';
        successEl.style.backgroundColor = 'rgba(46, 204, 113, 0.9)';
        successEl.style.color = 'white';
        successEl.style.padding = '10px 15px';
        successEl.style.borderRadius = '4px';
        successEl.style.zIndex = '999999';
        successEl.style.fontFamily = 'Arial, sans-serif';
        successEl.textContent = 'Page data collected successfully!';
        document.body.appendChild(successEl);
        
        // Remove success message after 3 seconds
        setTimeout(() => {
          successEl.remove();
          // Show the query modal
          toggleQueryModal();
        }, 1500);
      });
    } catch (error) {
      console.error('WebPilot Error:', error);
      loadingEl.remove();
      
      // Show error message
      const errorEl = document.createElement('div');
      errorEl.style.position = 'fixed';
      errorEl.style.top = '20px';
      errorEl.style.right = '20px';
      errorEl.style.backgroundColor = 'rgba(231, 76, 60, 0.9)';
      errorEl.style.color = 'white';
      errorEl.style.padding = '10px 15px';
      errorEl.style.borderRadius = '4px';
      errorEl.style.zIndex = '999999';
      errorEl.style.fontFamily = 'Arial, sans-serif';
      errorEl.textContent = 'Error collecting page data: ' + error.message;
      document.body.appendChild(errorEl);
      
      // Remove error message after 5 seconds
      setTimeout(() => {
        errorEl.remove();
      }, 5000);
    }
  }, 100);
  
  return { success: true };
}

// Delete project
function deleteProject() {
  const modal = document.getElementById('webpilot-query-modal');
  if (modal) {
    modal.remove();
  }
  
  // Clean up existing highlights and markers
  cleanupExistingHighlights();
  
  // Clear stored data
  pageData = {
    html: '',
    pageUrl: '',
    title: '',
    selectors: []
  };
  openAIApiKey = '';
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createProject') {
    const result = createProject(message.apiKey);
    sendResponse(result);
  } else if (message.action === 'toggleQueryModal') {
    toggleQueryModal();
    sendResponse({ success: true });
  } else if (message.action === 'deleteProject') {
    deleteProject();
    sendResponse({ success: true });
  }
  
  return true; // Keep the message channel open for async responses
});
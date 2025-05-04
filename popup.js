document.addEventListener('DOMContentLoaded', () => {
  const createProjectBtn = document.getElementById('create-project');
  const deleteProjectBtn = document.getElementById('delete-project');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const apiKeyInput = document.getElementById('api-key');
  const apiKeyStatus = document.getElementById('api-key-status');
  const projectInfo = document.getElementById('project-info');
  const projectUrl = document.getElementById('project-url');

  // Load API key from storage
  chrome.storage.local.get(['openai_api_key'], (result) => {
    if (result.openai_api_key) {
      apiKeyInput.value = result.openai_api_key;
      apiKeyStatus.textContent = 'API Key is saved';
      apiKeyStatus.style.color = 'green';
    }
  });

  // Check if a project exists for the current page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0].url;
    chrome.storage.local.get(['webpilot_projects'], (result) => {
      const projects = result.webpilot_projects || {};
      if (projects[currentUrl]) {
        // Project exists for this URL
        createProjectBtn.textContent = 'Launch Walkthrough Tool';
        projectInfo.classList.remove('hidden');
        projectUrl.textContent = new URL(currentUrl).hostname;
      }
    });
  });

  // Save API key
  saveApiKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ openai_api_key: apiKey }, () => {
        apiKeyStatus.textContent = 'API Key saved successfully!';
        apiKeyStatus.style.color = 'green';
      });
    } else {
      apiKeyStatus.textContent = 'Please enter a valid API key.';
      apiKeyStatus.style.color = 'red';
    }
  });

  // Create project button click handler
  createProjectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      chrome.storage.local.get(['webpilot_projects', 'openai_api_key'], (result) => {
        const projects = result.webpilot_projects || {};
        const apiKey = result.openai_api_key;
        
        if (!apiKey) {
          apiKeyStatus.textContent = 'Please save your OpenAI API key first!';
          apiKeyStatus.style.color = 'red';
          return;
        }
        
        // Check if we have a project for this URL
        const hasProject = projects[currentTab.url];
        
        // Create or toggle project message
        const statusMessage = document.createElement('div');
        statusMessage.style.marginTop = '10px';
        statusMessage.style.padding = '5px';
        statusMessage.style.borderRadius = '4px';
        statusMessage.style.textAlign = 'center';
        
        if (hasProject) {
          // Project already exists, activate query modal
          statusMessage.textContent = 'Opening walkthrough query modal...';
          statusMessage.style.backgroundColor = '#e8f4f8';
          statusMessage.style.color = '#2980b9';
          
          // Insert status message
          createProjectBtn.insertAdjacentElement('afterend', statusMessage);
          
          // Send message to content script
          chrome.tabs.sendMessage(currentTab.id, { action: 'toggleQueryModal' }, (response) => {
            // Remove status message after a delay
            setTimeout(() => {
              statusMessage.remove();
            }, 1500);
            
            // If no response, the content script may not be loaded
            if (!response) {
              console.error('No response from content script. It may not be loaded.');
              apiKeyStatus.textContent = 'Please refresh the page and try again.';
              apiKeyStatus.style.color = 'red';
            }
          });
        } else {
          // Show creating status message
          statusMessage.textContent = 'Creating project...';
          statusMessage.style.backgroundColor = '#eafaf1';
          statusMessage.style.color = '#27ae60';
          
          // Insert status message
          createProjectBtn.insertAdjacentElement('afterend', statusMessage);
          
          // Create a new project
          chrome.tabs.sendMessage(currentTab.id, { 
            action: 'createProject',
            apiKey: apiKey
          }, (response) => {
            if (response && response.success) {
              // Add project to storage
              projects[currentTab.url] = {
                title: currentTab.title,
                created: new Date().toISOString()
              };
              chrome.storage.local.set({ webpilot_projects: projects }, () => {
                // Update UI
                createProjectBtn.textContent = 'Launch Walkthrough Tool';
                projectInfo.classList.remove('hidden');
                projectUrl.textContent = new URL(currentTab.url).hostname;
                
                // Update status message
                statusMessage.textContent = 'Project created successfully!';
                
                // Remove status message after a delay
                setTimeout(() => {
                  statusMessage.remove();
                }, 1500);
              });
            } else {
              // Handle error
              statusMessage.textContent = 'Failed to create project. Please refresh and try again.';
              statusMessage.style.backgroundColor = '#fdedec';
              statusMessage.style.color = '#e74c3c';
              
              // Remove status message after a delay
              setTimeout(() => {
                statusMessage.remove();
              }, 3000);
            }
          });
        }
      });
    });
  });

  // Delete project button click handler
  deleteProjectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = tabs[0].url;
      chrome.storage.local.get(['webpilot_projects'], (result) => {
        const projects = result.webpilot_projects || {};
        if (projects[currentUrl]) {
          delete projects[currentUrl];
          chrome.storage.local.set({ webpilot_projects: projects }, () => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'deleteProject' });
            createProjectBtn.textContent = 'Create Walkthrough Project';
            projectInfo.classList.add('hidden');
          });
        }
      });
    });
  });
});
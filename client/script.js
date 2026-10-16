document.getElementById("createWallet").addEventListener("click", async () => {
  const button = document.getElementById("createWallet");
  const originalText = button.textContent;
  
  try {
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    
    const response = await fetch("/api/wallet/create-wallet", { method: "POST" });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create wallet');
    }
    
    displayOutput(data);
  } catch (error) {
    console.error('Create wallet error:', error);
    displayOutput({ error: error.message || 'Failed to create wallet. Please try again.' });
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

document.getElementById("importForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitButton = e.target.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  const privateKey = document.getElementById("privateKey").value.trim();
  
  // Validate private key format
  if (!privateKey || privateKey.length < 64) {
    displayOutput({ error: 'Invalid private key format. Please check and try again.' });
    return;
  }
  
  try {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    
    const response = await fetch("/api/wallet/import-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privateKey }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to import wallet');
    }
    
    displayOutput(data);
    document.getElementById("privateKey").value = '';
  } catch (error) {
    console.error('Import wallet error:', error);
    displayOutput({ error: error.message || 'Failed to import wallet. Please check your private key.' });
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});

function displayOutput(data) {
  const output = document.getElementById("output");
  
  // Security: Mask private keys in output
  let safeData = JSON.parse(JSON.stringify(data));
  if (safeData.privateKey) {
    safeData.privateKey = safeData.privateKey.substring(0, 10) + '••••••••••••••••••••' + safeData.privateKey.substring(safeData.privateKey.length - 4);
    safeData._warning = '⚠️ Private key has been masked for security';
  }
  
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#4ade80;white-space:pre-wrap;overflow-wrap:anywhere';
  pre.textContent = JSON.stringify(safeData, null, 2);
  output.replaceChildren(pre);
}

document.getElementById("sendTokensForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitButton = e.target.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  const privateKey = document.getElementById("sendPrivateKey").value.trim();
  const tokenAddress = document.getElementById("tokenAddress").value.trim();
  const recipient = document.getElementById("recipient").value.trim();
  const amount = document.getElementById("amount").value;

  // Validation
  if (!privateKey || privateKey.length < 64) {
    displayOutput({ error: 'Invalid private key format' });
    return;
  }
  
  if (!tokenAddress || !recipient) {
    displayOutput({ error: 'Please fill in all required fields' });
    return;
  }
  
  if (!amount || parseFloat(amount) <= 0) {
    displayOutput({ error: 'Amount must be greater than 0' });
    return;
  }

  // Confirmation dialog
  if (!confirm(`⚠️ Are you sure you want to send ${amount} tokens to ${recipient.substring(0, 10)}...?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    const response = await fetch("/api/wallet/send-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privateKey, tokenAddress, recipient, amount }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to send tokens');
    }

    displayOutput(data);
    
    // Clear form on success
    if (data.txHash) {
      e.target.reset();
    }
  } catch (error) {
    console.error('Send tokens error:', error);
    displayOutput({ error: error.message || 'Failed to send tokens. Please try again.' });
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});


// Get balance with proper error handling
document.getElementById("getBalanceForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitButton = e.target.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  const walletAddress = document.getElementById("balanceWalletAddress").value.trim();
  const tokenAddress = document.getElementById("balanceTokenAddress").value.trim();

  // Validation
  if (!walletAddress || !tokenAddress) {
    displayBalance({ error: true, message: 'Please enter both wallet and token addresses' });
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    
    const response = await fetch("/api/wallet/get-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenAddress, walletAddress }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch balance');
    }
    
    displayBalance(data);
  } catch (error) {
    console.error('Get balance error:', error);
    displayBalance({ error: true, message: error.message || 'Failed to get balance. Please try again.' });
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});

function displayBalance(data) {
  const output = document.getElementById('output');
  output.textContent = data.balance !== undefined ? 'Balance: ' + data.balance : 'Error: ' + (data.message || 'Unknown error');
}

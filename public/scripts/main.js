import { connectMetaMask } from './metamask.js';
import { post } from './api.js';

const out = document.getElementById('out');
const connectBtn = document.getElementById('connectBtn');

connectBtn.addEventListener('click', async ()=>{
  try{
    out.textContent = 'Connecting...';
    const addr = await connectMetaMask();
    out.textContent = 'Connected: ' + addr + '\\nVerifying...';

    // Call your existing backend function
    const r = await post('authenticateMetamask', { address: addr });
    out.textContent = 'Connected: ' + addr + '\\n' + JSON.stringify(r, null, 2);
  }catch(e){
    out.textContent = 'Error: ' + e.message;
  }
});
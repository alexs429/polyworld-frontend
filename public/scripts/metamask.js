export async function connectMetaMask(){
  if(!window.ethereum) throw new Error('MetaMask not found');
  const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return addr;
}
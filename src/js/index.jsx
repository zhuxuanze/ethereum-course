// Adapted from Merunas Grincalaitis's Casino tutorial; see THIRD_PARTY_NOTICES.md.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Web3 } from 'web3';
import clientModule from './casino-client.cjs';
import config from './config.cjs';
import '../css/index.css';

const { CasinoClient, errorMessage } = clientModule;
const ether = value => value === undefined ? '—' : Web3.utils.fromWei(value, 'ether');

function App() {
  const client = useRef(null);
  const version = useRef(0);
  const pending = useRef(false);
  const connecting = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('Select Sepolia in MetaMask, then connect your wallet.');
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState('');

  async function connect() {
    if (!window.ethereum) {
      setStatus('MetaMask was not detected. Install and enable it in this browser.');
      return;
    }
    if (pending.current) return;
    pending.current = true;
    connecting.current = true;
    setBusy(true);
    const session = ++version.current;
    const instance = new CasinoClient(window.ethereum);
    client.current = instance;
    setSnapshot(null);
    try {
      const next = await instance.connect();
      if (session !== version.current) return;
      setSnapshot(next);
      setAmount(ether(next.minimumBet));
      setTxHash('');
      setStatus('Connected. Contract data loaded from Sepolia.');
    } catch (error) {
      if (session === version.current) setStatus(errorMessage(error));
    } finally {
      connecting.current = false;
      pending.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return undefined;
    const invalidate = () => {
      ++version.current;
      client.current = null;
      setSnapshot(null);
      setTxHash('');
      setSelected(null);
      setStatus('The wallet account or network changed. Select Sepolia and reconnect.');
    };
    const accountsChanged = () => { if (!connecting.current) invalidate(); };
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', invalidate);
    provider.on?.('disconnect', invalidate);
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('chainChanged', invalidate);
      provider.removeListener?.('disconnect', invalidate);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!client.current?.account || pending.current) return;
      const session = version.current;
      try {
        const next = await client.current.readSnapshot();
        if (session === version.current) setSnapshot(next);
      } catch (error) {
        if (session === version.current) {
          setSnapshot(null);
          setStatus(`Could not refresh contract data: ${errorMessage(error)}`);
        }
      }
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  async function bet(event) {
    event.preventDefault();
    if (!client.current || !snapshot) {
      setStatus('Connect MetaMask first.');
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setTxHash('');
    const session = version.current;
    const instance = client.current;
    try {
      setStatus('Checking your bet. Confirm the transaction in MetaMask when prompted.');
      const receipt = await instance.placeBet(selected, amount, hash => {
        if (session === version.current) {
          setTxHash(hash);
          setStatus('Transaction submitted. Waiting for its receipt on Sepolia.');
        }
      });
      if (session !== version.current) return;
      setTxHash(receipt.transactionHash);
      setStatus('Bet confirmed successfully on Sepolia.');
      try {
        const next = await instance.readSnapshot();
        if (session === version.current) setSnapshot(next);
      } catch (error) {
        if (session === version.current) setStatus(`Bet confirmed. Could not refresh the display: ${errorMessage(error)}`);
      }
    } catch (error) {
      if (session === version.current) setStatus(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const full = snapshot && BigInt(snapshot.numberOfBets) >= BigInt(snapshot.maxAmountOfBets);
  const recorded = snapshot?.playerExists;

  return <main className="main-container">
    <h1>Bet for your best number and win huge amounts of Ether</h1>
    <p className="network">Sepolia Test Network · Test ETH only</p>
    <button type="button" onClick={connect} disabled={busy}>Connect MetaMask</button>
    <p className="address">Connected account: {snapshot?.account || 'Not connected'}</p>
    <p className="address">Casino contract: <a href={`${config.explorer}/address/${config.contractAddress}`} target="_blank" rel="noreferrer">{config.contractAddress}</a></p>
    <dl className="stats">
      <div><dt>Number of bets:</dt><dd>{snapshot?.numberOfBets ?? '—'}</dd></div>
      <div><dt>Last number winner:</dt><dd>{snapshot ? (snapshot.numberWinner === '0' ? 'No completed draw yet' : snapshot.numberWinner) : '—'}</dd></div>
      <div><dt>Total ether bet:</dt><dd>{ether(snapshot?.totalBet)} Sepolia ETH</dd></div>
      <div><dt>Minimum bet:</dt><dd>{ether(snapshot?.minimumBet)} Sepolia ETH</dd></div>
      <div><dt>Max amount of bets:</dt><dd>{snapshot?.maxAmountOfBets ?? '—'}</dd></div>
    </dl>
    {snapshot && snapshot.maxAmountOfBets !== '100' && <p className="notice">This deployment is configured for {snapshot.maxAmountOfBets} bets. Assignment 2 describes a 100-bet game.</p>}
    <hr />
    <form onSubmit={bet}>
      <h2>Vote for the next number</h2>
      <label htmlFor="bet-amount"><b>How much Ether do you want to bet?</b></label>
      <input id="bet-amount" className="bet-input" type="text" inputMode="decimal" value={amount}
        placeholder={ether(snapshot?.minimumBet)} onChange={event => setAmount(event.target.value)} disabled={busy} />
      <span>Sepolia ETH</span>
      <fieldset disabled={busy || !snapshot || recorded || full}>
        <legend>Choose a number from 1 to 10</legend>
        <div className="numbers">{Array.from({ length: 10 }, (_, i) => i + 1).map(number =>
          <button type="button" key={number} aria-pressed={selected === number}
            className={selected === number ? 'number-selected' : ''} onClick={() => setSelected(number)}>{number}</button>
        )}</div>
      </fieldset>
      <button type="submit" className="submit" disabled={busy || !snapshot || selected === null || recorded || full}>
        {busy ? 'Working…' : 'Place Bet'}
      </button>
    </form>
    {recorded && <p className="notice">This account already has a recorded bet. Another bet from this account will be rejected by the contract.</p>}
    {full && <p className="notice">The round is full. Waiting for the oracle callback, winner selection and prize distribution.</p>}
    <p role="status" aria-live="polite" className="status">{status}</p>
    {txHash && <p className="address">Transaction: <a href={`${config.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a></p>}
    <hr />
    <p className="hint">Only working with the Sepolia Test Network.<br />You can only vote once per account in the tutorial contract.<br />Your bet is reflected after the transaction is included in a block.</p>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);

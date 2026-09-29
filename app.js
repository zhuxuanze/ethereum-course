const contractAddress =
  "0xc9D1Be30FF054a67B3C68974F37401929Aff2D51";

const contractABI = [
  {
    constant: false,
    inputs: [
      {
        name: "numberToBet",
        type: "uint256"
      }
    ],
    name: "bet",
    outputs: [],
    payable: true,
    stateMutability: "payable",
    type: "function"
  }
];

let web3;
let account;
let casino;

const connectButton = document.getElementById("connectButton");
const betButton = document.getElementById("betButton");
const accountText = document.getElementById("account");
const statusText = document.getElementById("status");

connectButton.onclick = async function () {
  if (typeof window.ethereum === "undefined") {
    statusText.innerText = "Please install MetaMask.";
    return;
  }

  web3 = new Web3(window.ethereum);

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts"
  });

  account = accounts[0];
  casino = new web3.eth.Contract(contractABI, contractAddress);

  accountText.innerText = "Connected: " + account;
  statusText.innerText = "Connected to Casino contract.";
};

betButton.onclick = async function () {
  if (!casino) {
    statusText.innerText = "Please connect MetaMask first.";
    return;
  }

  const number = document.getElementById("betNumber").value;

  if (number < 1 || number > 10) {
    statusText.innerText = "Please choose a number from 1 to 10.";
    return;
  }

  statusText.innerText = "Please confirm the transaction in MetaMask.";

  try {
    await casino.methods.bet(number).send({
      from: account,
      value: web3.utils.toWei("0.1", "ether")
    });

    statusText.innerText = "Bet submitted successfully.";
  } catch (error) {
    statusText.innerText = "Transaction cancelled or failed.";
    console.error(error);
  }
};
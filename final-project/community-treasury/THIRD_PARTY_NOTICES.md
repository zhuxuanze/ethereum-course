# Third-party software

The source package uses pinned npm dependencies listed in package.json and package-lock.json. The browser build includes ethers.js 6.15.0 and Ganache 7.9.2. Their license texts/notices are distributed alongside the browser bundles in dist/vendor/. Solidity compilation uses solc-js 0.8.30. Dependency licenses and transitive notices remain with the installed npm packages; do not remove them when redistributing a full dependency installation.

The treasury implementation is an educational application of the established N-of-M approval pattern. Its design should not be represented as an original invention of multisignature wallets. The project is not affiliated with or endorsed by Ethereum, Safe, OpenZeppelin, Ganache or ethers.js.

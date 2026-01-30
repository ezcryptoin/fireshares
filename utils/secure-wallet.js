const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'referral-history.json');

// Load atau buat history file (HANYA simpan public address)
function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
        return [];
    }
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
}

function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Generate wallet BARU untuk referral
 * PRIVATE KEY TIDAK PERNAH DISIMPAN KE DISK!
 * Hanya return object dengan address + signature sementara
 */
function generateReferralWallet() {
    const wallet = ethers.Wallet.createRandom();
    
    // ⚠️ PRIVATE KEY HANYA ADA DI MEMORI, TIDAK DISIMPAN!
    return {
        address: wallet.address,
        privateKey: wallet.privateKey, // Hanya di memori selama proses
        mnemonic: wallet.mnemonic.phrase // Opsional: bisa diabaikan untuk keamanan ekstra
    };
}

/**
 * Simpan hanya public address ke history (aman untuk commit)
 */
function saveReferralRecord(address, referralCode, status = 'pending') {
    const history = loadHistory();
    
    history.push({
        timestamp: new Date().toISOString(),
        address: address,
        referralCode: referralCode,
        status: status,
        txHash: null
    });
    
    saveHistory(history);
    console.log(`✅ Referral recorded for ${address.slice(0, 10)}... (private key NOT saved)`);
}

module.exports = {
    generateReferralWallet,
    saveReferralRecord,
    loadHistory
};

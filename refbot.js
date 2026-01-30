#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load config
const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const API_BASE = config.api.baseUrl.trim(); // ✅ Pastikan trim spasi
const ACCESS_CODE = config.referral.accessCode;
const MAX_REFERRALS = config.referral.maxReferrals;
const JOIN_ENDPOINT = config.api.endpoints.joinWaitlist;

// Validasi config
if (!API_BASE || API_BASE.includes(' ')) {
    console.error(chalk.red('❌ baseUrl mengandung spasi! Perbaiki config.json'));
    process.exit(1);
}

async function claimReferral(wallet, accessCode) {
    try {
        // Step 1: Sign message
        const message = "Welcome to FairShares\n\nSign this message to join the FairShares waitlist.\nThis signature does not trigger any blockchain transaction.";
        const signature = await wallet.signMessage(message);

        // Step 2: Login dengan headers lengkap
        const loginResp = await axios.post(
            `${API_BASE}${config.api.endpoints.evmConnect}`,
            {
                walletAddress: wallet.address,
                message: message,
                signature: signature
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': config.api.appUrl.trim(),
                    'Referer': `${config.api.appUrl.trim()}/waitlist`
                },
                timeout: 15000
            }
        );

        if (loginResp.data.code !== 200) {
            throw new Error(`Login failed: ${loginResp.data.message || JSON.stringify(loginResp.data)}`);
        }

        const token = loginResp.data.data?.token;
        if (!token) throw new Error('No token received');

        // ✅ Step 3: JOIN WAITLIST DENGAN ENDPOINT YANG BENAR
        const claimResp = await axios.post(
            `${API_BASE}${JOIN_ENDPOINT}`, // ✅ /user_public/join_waitlist
            {
                accessCode: accessCode // ✅ BUKAN inviteCode!
            },
            {
                headers: {
                    'Authorization': `jwt ${token}`,
                    'Content-Type': 'application/json',
                    'Origin': config.api.appUrl.trim(),
                    'Referer': `${config.api.appUrl.trim()}/waitlist`
                },
                timeout: 15000
            }
        );

        if (claimResp.data.code === 200) {
            console.log(chalk.green(`✅ Berhasil claim referral untuk ${wallet.address.slice(0, 10)}...`));
            return { success: true, data: claimResp.data };
        } else {
            throw new Error(claimResp.data.message || JSON.stringify(claimResp.data));
        }

    } catch (error) {
        if (error.response) {
            console.error(chalk.red(`❌ HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`));
        } else {
            console.error(chalk.red(`❌ Error: ${error.message}`));
        }
        return { success: false, error: error.message };
    }
}

// Simpan hanya public address (aman untuk GitHub)
function saveReferralRecord(address, accessCode, status) {
    const HISTORY_FILE = path.join(__dirname, 'referral-history.json');
    let history = [];
    
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        } catch (e) {
            history = [];
        }
    }
    
    history.push({
        timestamp: new Date().toISOString(),
        address: address,
        accessCode: accessCode,
        status: status
    });
    
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log(chalk.gray(`📁 Tersimpan di referral-history.json (HANYA public address)`));
}

async function runBot() {
    console.log(chalk.blue.bold('\n===== FAIRSHARES AUTO REFERRAL BOT (SECURE MODE) ====='));
    console.log(chalk.yellow(`🔗 Access Code: ${ACCESS_CODE}`));
    console.log(chalk.yellow(`🔢 Max Referrals: ${MAX_REFERRALS}`));
    console.log(chalk.red.bold('⚠️  PRIVATE KEY TIDAK DISIMPAN KE DISK!\n'));

    for (let i = 1; i <= MAX_REFERRALS; i++) {
        console.log(chalk.cyan(`\n🔄 Memproses referral #${i}...`));
        
        // Generate wallet baru (private key hanya di memori)
        const wallet = ethers.Wallet.createRandom();
        console.log(`📧 Wallet: ${chalk.bold(wallet.address)}`);
        
        // Claim referral
        const result = await claimReferral(wallet, ACCESS_CODE);
        
        // Simpan HANYA public address
        saveReferralRecord(wallet.address, ACCESS_CODE, result.success ? 'success' : 'failed');
        
        // Delay antar referral
        if (i < MAX_REFERRALS) {
            const min = config.referral.delayBetweenReferralsMs.min;
            const max = config.referral.delayBetweenReferralsMs.max;
            const delay = Math.floor(Math.random() * (max - min + 1)) + min;
            console.log(chalk.gray(`⏳ Menunggu ${Math.round(delay/1000)} detik...`));
            await new Promise(res => setTimeout(res, delay));
        }
    }

    console.log(chalk.green.bold('\n✅ Semua referral selesai!'));
    console.log(chalk.yellow('📁 History: referral-history.json (aman untuk GitHub)'));
    console.log(chalk.red.bold('🔒 Private key TIDAK PERNAH disimpan!'));
}

// Jalankan
runBot().catch(err => {
    console.error(chalk.red(`\n💥 Fatal error: ${err.message}`));
    process.exit(1);
});

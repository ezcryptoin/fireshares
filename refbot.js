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

const API_BASE = config.api.baseUrl.trim();
const ACCESS_CODE = config.referral.accessCode;
const MAX_REFERRALS = config.referral.maxReferrals;
const JOIN_ENDPOINT = config.api.endpoints.joinWaitlist;

// Validasi config
if (!API_BASE || API_BASE.includes(' ')) {
    console.error(chalk.red('❌ baseUrl mengandung spasi! Perbaiki config.json'));
    process.exit(1);
}

// ✅ DEBUG: Tampilkan konfigurasi
console.log(chalk.blue.bold('\n===== DEBUG CONFIG ====='));
console.log(chalk.gray(`API Base: ${API_BASE}`));
console.log(chalk.gray(`Join Endpoint: ${JOIN_ENDPOINT}`));
console.log(chalk.gray(`Access Code: ${ACCESS_CODE}`));
console.log(chalk.gray(`Max Referrals: ${MAX_REFERRALS}`));
console.log(chalk.blue.bold('========================\n'));

async function loginWithWallet(wallet) {
    try {
        // Step 1: Sign message
        const message = "Welcome to FairShares\n\nSign this message to join the FairShares waitlist.\nThis signature does not trigger any blockchain transaction.";
        const signature = await wallet.signMessage(message);

        console.log(chalk.yellow(`📝 Signing message...`));
        console.log(chalk.gray(`   Message: ${message.slice(0, 50)}...`));
        console.log(chalk.gray(`   Signature: ${signature.slice(0, 20)}...`));

        // Step 2: Login ke API
        console.log(chalk.yellow(`🔐 Login ke API...`));
        
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

        console.log(chalk.green(`✅ Login Response Status: ${loginResp.status}`));
        console.log(chalk.gray(`   Response Code: ${loginResp.data.code}`));
        console.log(chalk.gray(`   Response Data: ${JSON.stringify(loginResp.data.data)}`));

        if (loginResp.data.code !== 200) {
            throw new Error(`Login failed: ${loginResp.data.message || JSON.stringify(loginResp.data)}`);
        }

        const token = loginResp.data.data?.token;
        if (!token) {
            console.error(chalk.red('❌ Token tidak ditemukan dalam response!'));
            console.error(chalk.gray(`   Full response: ${JSON.stringify(loginResp.data)}`));
            throw new Error('No token received from login');
        }

        console.log(chalk.green(`✅ Token diterima: ${token.slice(0, 30)}...`));

        // Format token dengan prefix "jwt "
        let authHeader = token;
        if (!token.startsWith('jwt ')) {
            authHeader = `jwt ${token}`;
            console.log(chalk.yellow(`⚠️  Menambahkan prefix "jwt "`));
        }

        return {
            success: true,
            token: authHeader,
            walletAddress: wallet.address
        };

    } catch (error) {
        console.error(chalk.red(`❌ Login gagal:`));
        if (error.response) {
            console.error(chalk.red(`   Status: ${error.response.status}`));
            console.error(chalk.red(`   Data: ${JSON.stringify(error.response.data)}`));
        } else {
            console.error(chalk.red(`   Error: ${error.message}`));
        }
        return { success: false, error: error.message };
    }
}

async function claimReferral(wallet, accessCode) {
    try {
        // ✅ Step 1: Login terlebih dahulu
        const loginResult = await loginWithWallet(wallet);
        
        if (!loginResult.success) {
            throw new Error(`Login failed: ${loginResult.error}`);
        }

        const token = loginResult.token;
        console.log(chalk.green(`\n✅ Login berhasil!`));
        console.log(chalk.gray(`   Wallet: ${wallet.address.slice(0, 15)}...`));
        console.log(chalk.gray(`   Token: ${token.slice(0, 40)}...`));

        // ✅ Step 2: Join waitlist dengan token yang valid
        console.log(chalk.yellow(`\n🚀 Claiming referral...`));
        
        const claimResp = await axios.post(
            `${API_BASE}${JOIN_ENDPOINT}`,
            {
                accessCode: accessCode
            },
            {
                headers: {
                    'Authorization': token, // ✅ Sudah include "jwt " prefix
                    'Content-Type': 'application/json',
                    'Origin': config.api.appUrl.trim(),
                    'Referer': `${config.api.appUrl.trim()}/waitlist`
                },
                timeout: 15000
            }
        );

        console.log(chalk.green(`✅ Claim Response Status: ${claimResp.status}`));
        console.log(chalk.gray(`   Response: ${JSON.stringify(claimResp.data)}`));

        if (claimResp.data.code === 200) {
            console.log(chalk.green(`\n✅✅✅ BERHASIL CLAIM REFERRAL! ✅✅✅`));
            console.log(chalk.green(`   Wallet: ${wallet.address}`));
            console.log(chalk.green(`   Access Code: ${accessCode}`));
            return { success: true,  claimResp.data };
        } else {
            throw new Error(claimResp.data.message || JSON.stringify(claimResp.data));
        }

    } catch (error) {
        console.error(chalk.red(`\n❌❌❌ GAGAL CLAIM REFERRAL ❌❌❌`));
        if (error.response) {
            console.error(chalk.red(`   HTTP Status: ${error.response.status}`));
            console.error(chalk.red(`   Response: ${JSON.stringify(error.response.data)}`));
            
            // Analisis error 401 spesifik
            if (error.response.status === 401) {
                console.error(chalk.yellow(`\n🔍 Analisis Error 401:`));
                console.error(chalk.yellow(`   - Token mungkin tidak valid`));
                console.error(chalk.yellow(`   - Token mungkin kadaluarsa`));
                console.error(chalk.yellow(`   - Format token salah (harus "jwt <token>")`));
                console.error(chalk.yellow(`   - Wallet belum terdaftar di sistem`));
            }
        } else {
            console.error(chalk.red(`   Error: ${error.message}`));
        }
        return { success: false, error: error.message };
    }
}

// Simpan hanya public address (aman untuk GitHub)
function saveReferralRecord(address, accessCode, status, success = false) {
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
        status: status,
        success: success
    });
    
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log(chalk.gray(`\n📁 Tersimpan di referral-history.json`));
}

async function runBot() {
    console.log(chalk.blue.bold('\n===== FAIRSHARES AUTO REFERRAL BOT ====='));
    console.log(chalk.yellow(`🔗 Access Code: ${ACCESS_CODE}`));
    console.log(chalk.yellow(`🔢 Max Referrals: ${MAX_REFERRALS}`));
    console.log(chalk.red.bold('⚠️  Private key hanya di memori!\n'));

    for (let i = 1; i <= MAX_REFERRALS; i++) {
        console.log(chalk.cyan(`\n${'='.repeat(50)}`));
        console.log(chalk.cyan(`🔄 Referral #${i} dari ${MAX_REFERRALS}`));
        console.log(chalk.cyan(`${'='.repeat(50)}`));
        
        // Generate wallet baru
        const wallet = ethers.Wallet.createRandom();
        console.log(chalk.blue(`\n📧 Wallet Baru:`));
        console.log(chalk.gray(`   Address: ${wallet.address}`));
        console.log(chalk.gray(`   Private Key: ${wallet.privateKey.slice(0, 20)}... (HANYA DI MEMORI)`));
        
        // Claim referral
        const result = await claimReferral(wallet, ACCESS_CODE);
        
        // Simpan hasil
        saveReferralRecord(
            wallet.address, 
            ACCESS_CODE, 
            result.success ? 'success' : 'failed',
            result.success
        );
        
        // Delay antar referral
        if (i < MAX_REFERRALS) {
            const min = config.referral.delayBetweenReferralsMs.min;
            const max = config.referral.delayBetweenReferralsMs.max;
            const delay = Math.floor(Math.random() * (max - min + 1)) + min;
            console.log(chalk.gray(`\n⏳ Menunggu ${Math.round(delay/1000)} detik sebelum referral berikutnya...`));
            await new Promise(res => setTimeout(res, delay));
        }
    }

    console.log(chalk.green.bold(`\n${'='.repeat(50)}`));
    console.log(chalk.green.bold('✅ SELESAI - Semua referral diproses!'));
    console.log(chalk.green.bold(`${'='.repeat(50)}`));
    console.log(chalk.yellow('\n📁 File referral-history.json aman untuk GitHub'));
    console.log(chalk.red.bold('🔒 Private key TIDAK PERNAH disimpan ke disk!'));
}

// Handle exit
process.on('exit', () => {
    console.log(chalk.gray('\n🧹 Membersihkan memori...'));
});

process.on('SIGINT', () => {
    console.log(chalk.red('\n⚠️  Bot dihentikan. Private key sudah dihapus.'));
    process.exit(0);
});

// Jalankan
runBot().catch(err => {
    console.error(chalk.red(`\n💥 Fatal error: ${err.message}`));
    console.error(err);
    process.exit(1);
});

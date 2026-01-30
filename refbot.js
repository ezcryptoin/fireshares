#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');
const { ethers } = require('ethers');
const { generateReferralWallet, saveReferralRecord } = require('./utils/secure-wallet');

// Konfigurasi dari environment variables (aman)
const REFERRAL_LINK = process.env.REFERRAL_LINK || 'https://app.fairshares.io/waitlist?AccessCode=lmir452w';
const ACCESS_CODE = process.env.ACCESS_CODE || 'lmir452w';
const API_BASE = 'https://api.fairshares.io';
const MAX_REFERRALS = parseInt(process.env.MAX_REFERRALS || '5');

// Validasi environment
if (!process.env.ACCESS_CODE) {
    console.error(chalk.red('❌ ACCESS_CODE tidak ditemukan di .env!'));
    console.error(chalk.yellow('Buat file .env dari .env.example terlebih dahulu'));
    process.exit(1);
}

async function claimReferral(wallet, accessCode) {
    try {
        // Step 1: Sign message untuk autentikasi
        const message = "Welcome to FairShares\n\nSign this message to join the FairShares waitlist.\nThis signature does not trigger any blockchain transaction.";
        const signature = await wallet.signMessage(message);

        // Step 2: Login ke API
        const loginResp = await axios.post(`${API_BASE}/user_public/evm_connect`, {
            walletAddress: wallet.address,
            message: message,
            signature: signature
        }, { timeout: 10000 });

        if (loginResp.data.code !== 200) {
            throw new Error(`Login failed: ${loginResp.data.message || 'Unknown error'}`);
        }

        const token = loginResp.data.data?.token;
        if (!token) throw new Error('No token received');

        // Step 3: Claim referral dengan access code
        const claimResp = await axios.post(`${API_BASE}/user_public/join_waitlist`, {
            inviteCode: accessCode
        }, {
            headers: {
                'Authorization': `jwt ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (claimResp.data.code === 200) {
            console.log(chalk.green(`✅ Berhasil claim referral untuk ${wallet.address.slice(0, 10)}...`));
            return { success: true, data: claimResp.data };
        } else {
            throw new Error(claimResp.data.message || 'Claim failed');
        }

    } catch (error) {
        console.error(chalk.red(`❌ Gagal untuk ${wallet.address.slice(0, 10)}...: ${error.message}`));
        return { success: false, error: error.message };
    }
}

async function runBot() {
    console.log(chalk.blue.bold('\n===== FAIRSHARES AUTO REFERRAL BOT (SECURE MODE) ====='));
    console.log(chalk.yellow(`🔗 Referral Link: ${REFERRAL_LINK}`));
    console.log(chalk.yellow(`🔢 Max Referrals: ${MAX_REFERRALS}`));
    console.log(chalk.red.bold('⚠️  PRIVATE KEY TIDAK AKAN DISIMPAN KE DISK!'));
    console.log(chalk.red.bold('⚠️  Wallet hanya hidup di memori selama proses\n'));

    for (let i = 1; i <= MAX_REFERRALS; i++) {
        console.log(chalk.cyan(`\n🔄 Memproses referral #${i}...`));
        
        // Generate wallet BARU (private key hanya di memori)
        const { address, privateKey } = generateReferralWallet();
        const wallet = new ethers.Wallet(privateKey);
        
        console.log(`📧 Alamat wallet baru: ${chalk.bold(address)}`);
        
        // Claim referral
        const result = await claimReferral(wallet, ACCESS_CODE);
        
        // Simpan HANYA public address ke history (aman untuk commit)
        saveReferralRecord(address, ACCESS_CODE, result.success ? 'success' : 'failed');
        
        // ⚠️ PRIVATE KEY LANGSUNG DIHAPUS DARI MEMORI
        // Tidak ada referensi lagi ke privateKey setelah ini
        
        // Delay antar referral (hindari rate limit)
        if (i < MAX_REFERRALS) {
            const delay = 3000 + Math.random() * 2000;
            console.log(chalk.gray(`⏳ Menunggu ${Math.round(delay/1000)} detik sebelum referral berikutnya...`));
            await new Promise(res => setTimeout(res, delay));
        }
    }

    console.log(chalk.green.bold('\n✅ Semua referral selesai diproses!'));
    console.log(chalk.yellow('📁 History tersimpan di referral-history.json (HANYA public address)'));
    console.log(chalk.red.bold('🔒 Private key TIDAK PERNAH disimpan - aman untuk GitHub!'));
}

// Handle exit untuk pastikan private key tidak bocor
process.on('exit', () => {
    console.log(chalk.gray('\n🧹 Membersihkan memori...'));
});

process.on('SIGINT', () => {
    console.log(chalk.red('\n⚠️  Bot dihentikan. Private key sudah dihapus dari memori.'));
    process.exit(0);
});

// Jalankan bot
runBot().catch(error => {
    console.error(chalk.red(`\n💥 Error fatal: ${error.message}`));
    process.exit(1);
});

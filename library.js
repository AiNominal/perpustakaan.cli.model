#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Konfigurasi sistem yang lebih aman
const CONFIG = {
    DATA_FILE: 'library_data.json',
    BACKUP_DIR: 'backups',
    MAX_BORROW_DAYS: 14,
    MAX_BOOKS_PER_USER: 5,
    FINE_PER_DAY: 2000,
    AUTO_SAVE: true,
    MAX_BACKUP_FILES: 10
};

// Database dengan inisialisasi yang lebih aman
let database = {
    books: [],
    members: [],
    transactions: [],
    categories: ['Fiksi', 'Non-Fiksi', 'Sains', 'Teknologi', 'Sejarah', 'Biografi', 'Pendidikan', 'Agama', 'Seni', 'Olahraga'],
    settings: Object.assign({}, CONFIG),
    stats: {
        totalBooks: 0,
        totalMembers: 0,
        totalTransactions: 0,
        booksOnLoan: 0,
        overdueBooks: 0
    }
};

// Interface readline dengan error handling
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Utility Functions dengan validasi tambahan
class Utils {
    static generateId() {
        return crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    static formatDate(date = new Date()) {
        if (!(date instanceof Date)) date = new Date(date);
        return date.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static calculateDaysDiff(date1, date2) {
        if (!(date1 instanceof Date)) date1 = new Date(date1);
        if (!(date2 instanceof Date)) date2 = new Date(date2);
        const diffTime = Math.abs(date2 - date1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    static formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(amount);
    }

    static validateISBN(isbn) {
        if (!isbn) return false;
        const cleanISBN = isbn.replace(/[-\s]/g, '');
        return /^\d{10}(\d{3})?$/.test(cleanISBN);
    }

    static searchText(text, query) {
        if (!text || !query) return false;
        return text.toString().toLowerCase().includes(query.toString().toLowerCase());
    }
}

// Data Management dengan backup rotation
class DataManager {
    static saveData() {
        try {
            // Pastikan direktori backup ada
            if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
                fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });
            }
            
            // Rotasi backup - simpan maksimal 10 file backup
            const backupFiles = fs.readdirSync(CONFIG.BACKUP_DIR)
                .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
                .sort()
                .reverse();
            
            if (backupFiles.length >= CONFIG.MAX_BACKUP_FILES) {
                for (let i = CONFIG.MAX_BACKUP_FILES - 1; i < backupFiles.length; i++) {
                    fs.unlinkSync(path.join(CONFIG.BACKUP_DIR, backupFiles[i]));
                }
            }
            
            // Buat backup baru
            const backupFile = path.join(CONFIG.BACKUP_DIR, `backup_${Date.now()}.json`);
            if (fs.existsSync(CONFIG.DATA_FILE)) {
                fs.copyFileSync(CONFIG.DATA_FILE, backupFile);
            }
            
            // Simpan data utama
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(database, null, 2));
            console.log('✓ Data berhasil disimpan');
            return true;
        } catch (error) {
            console.log('✗ Gagal menyimpan data:', error.message);
            return false;
        }
    }

    static loadData() {
        try {
            if (fs.existsSync(CONFIG.DATA_FILE)) {
                const data = fs.readFileSync(CONFIG.DATA_FILE, 'utf8');
                const parsedData = JSON.parse(data);
                
                // Merge dengan database default
                database = {
                    ...database,
                    ...parsedData,
                    settings: { ...CONFIG, ...(parsedData.settings || {}) }
                };
                
                this.updateStats();
                console.log('✓ Data berhasil dimuat');
                return true;
            }
            return false;
        } catch (error) {
            console.log('✗ Gagal memuat data:', error.message);
            return false;
        }
    }

    static updateStats() {
        database.stats = {
            totalBooks: database.books.length,
            totalMembers: database.members.length,
            totalTransactions: database.transactions.length,
            booksOnLoan: database.books.filter(book => !book.available).length,
            overdueBooks: this.getOverdueBooks().length
        };
    }

    static getOverdueBooks() {
        const today = new Date();
        return database.transactions.filter(t => 
            t.status === 'borrowed' && new Date(t.dueDate) < today
        );
    }
}

// [Bagian-bagian lain dari kode tetap sama, tetapi dengan perbaikan serupa]

// Book Management
class BookManager {
    static async addBook() {
        console.log('\n🔷 TAMBAH BUKU BARU 🔷');
        
        try {
            const bookData = {};
            
            bookData.id = Utils.generateId();
            bookData.title = await this.getInput('Judul buku: ');
            bookData.author = await this.getInput('Penulis: ');
            bookData.isbn = await this.getInput('ISBN (opsional): ');
            
            if (bookData.isbn && !Utils.validateISBN(bookData.isbn)) {
                console.log('⚠️ Format ISBN tidak valid, tetapi buku akan tetap ditambahkan');
            }
            
            console.log('\nKategori tersedia:');
            database.categories.forEach((cat, index) => {
                console.log(`${index + 1}. ${cat}`);
            });
            
            const categoryIndex = parseInt(await this.getInput('Pilih kategori (nomor): ')) - 1;
            bookData.category = database.categories[categoryIndex] || 'Lainnya';
            
            bookData.publisher = await this.getInput('Penerbit: ');
            bookData.year = parseInt(await this.getInput('Tahun terbit: ')) || new Date().getFullYear();
            bookData.pages = parseInt(await this.getInput('Jumlah halaman: ')) || 0;
            bookData.copies = parseInt(await this.getInput('Jumlah eksemplar: ')) || 1;
            
            bookData.available = true;
            bookData.availableCopies = bookData.copies;
            bookData.addedDate = new Date().toISOString();
            bookData.description = await this.getInput('Deskripsi singkat (opsional): ');
            bookData.location = await this.getInput('Lokasi rak: ');
            
            database.books.push(bookData);
            DataManager.updateStats();
            
            if (CONFIG.AUTO_SAVE) DataManager.saveData();
            
            console.log(`\n✅ Buku "${bookData.title}" berhasil ditambahkan!`);
            console.log(`📚 ID Buku: ${bookData.id}`);
            
        } catch (error) {
            console.log('❌ Gagal menambahkan buku:', error.message);
        }
    }

    static async editBook() {
        console.log('\n📝 EDIT BUKU');
        
        const query = await this.getInput('Masukkan judul atau ID buku yang akan diedit: ');
        const book = database.books.find(b => 
            b.title.toLowerCase().includes(query.toLowerCase()) || 
            b.id === query.toUpperCase()
        );
        
        if (!book) {
            console.log('❌ Buku tidak ditemukan');
            return;
        }
        
        console.log(`\n📖 Mengedit: "${book.title}"`);
        console.log('(Tekan Enter untuk tidak mengubah)');
        
        const newTitle = await this.getInput(`Judul baru [${book.title}]: `);
        if (newTitle) book.title = newTitle;
        
        const newAuthor = await this.getInput(`Penulis baru [${book.author}]: `);
        if (newAuthor) book.author = newAuthor;
        
        const newDescription = await this.getInput(`Deskripsi baru [${book.description || 'Kosong'}]: `);
        if (newDescription) book.description = newDescription;
        
        const newLocation = await this.getInput(`Lokasi baru [${book.location || 'Tidak ada'}]: `);
        if (newLocation) book.location = newLocation;
        
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        console.log('✅ Buku berhasil diperbarui!');
    }

    static async deleteBook() {
        console.log('\n🗑️ HAPUS BUKU');
        
        const query = await this.getInput('Masukkan judul atau ID buku yang akan dihapus: ');
        const bookIndex = database.books.findIndex(b => 
            b.title.toLowerCase().includes(query.toLowerCase()) || 
            b.id === query.toUpperCase()
        );
        
        if (bookIndex === -1) {
            console.log('❌ Buku tidak ditemukan');
            return;
        }
        
        const book = database.books[bookIndex];
        
        if (!book.available) {
            console.log('❌ Tidak dapat menghapus buku yang sedang dipinjam');
            return;
        }
        
        const confirm = await this.getInput(`⚠️ Yakin ingin menghapus "${book.title}"? (y/N): `);
        if (confirm.toLowerCase() === 'y') {
            database.books.splice(bookIndex, 1);
            DataManager.updateStats();
            if (CONFIG.AUTO_SAVE) DataManager.saveData();
            console.log('✅ Buku berhasil dihapus');
        } else {
            console.log('❌ Penghapusan dibatalkan');
        }
    }

    static getInput(question) {
        return new Promise(resolve => {
            rl.question(question, answer => resolve(answer.trim()));
        });
    }
}

// Member Management
class MemberManager {
    static async addMember() {
        console.log('\n👤 TAMBAH ANGGOTA BARU');
        
        const memberData = {};
        memberData.id = Utils.generateId();
        memberData.name = await BookManager.getInput('Nama lengkap: ');
        memberData.email = await BookManager.getInput('Email: ');
        memberData.phone = await BookManager.getInput('Nomor telepon: ');
        memberData.address = await BookManager.getInput('Alamat: ');
        memberData.joinDate = new Date().toISOString();
        memberData.status = 'active';
        memberData.borrowedBooks = [];
        memberData.borrowHistory = [];
        memberData.fines = 0;
        
        database.members.push(memberData);
        DataManager.updateStats();
        
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        
        console.log(`\n✅ Anggota "${memberData.name}" berhasil didaftarkan!`);
        console.log(`🆔 ID Anggota: ${memberData.id}`);
    }

    static async viewMembers() {
        console.log('\n👥 DAFTAR ANGGOTA');
        
        if (database.members.length === 0) {
            console.log('📭 Belum ada anggota terdaftar');
            return;
        }
        
        console.log('='.repeat(80));
        database.members.forEach((member, index) => {
            console.log(`${index + 1}. ${member.name} (${member.id})`);
            console.log(`   📧 ${member.email} | 📱 ${member.phone}`);
            console.log(`   📚 Dipinjam: ${member.borrowedBooks.length} | 💰 Denda: ${Utils.formatCurrency(member.fines)}`);
            console.log(`   📅 Bergabung: ${Utils.formatDate(new Date(member.joinDate))}`);
            console.log('-'.repeat(40));
        });
    }
}

// Transaction Management  
class TransactionManager {
    static async borrowBook() {
        console.log('\n📤 PINJAM BUKU');
        
        // Cari anggota
        const memberId = await BookManager.getInput('ID atau nama anggota: ');
        const member = database.members.find(m => 
            m.id === memberId.toUpperCase() || 
            m.name.toLowerCase().includes(memberId.toLowerCase())
        );
        
        if (!member) {
            console.log('❌ Anggota tidak ditemukan');
            return;
        }
        
        if (member.borrowedBooks.length >= CONFIG.MAX_BOOKS_PER_USER) {
            console.log(`❌ Anggota sudah mencapai batas maksimum (${CONFIG.MAX_BOOKS_PER_USER} buku)`);
            return;
        }
        
        if (member.fines > 0) {
            console.log(`⚠️ Anggota memiliki denda: ${Utils.formatCurrency(member.fines)}`);
            const proceed = await BookManager.getInput('Lanjutkan peminjaman? (y/N): ');
            if (proceed.toLowerCase() !== 'y') return;
        }
        
        // Cari buku
        const bookQuery = await BookManager.getInput('Judul atau ID buku: ');
        const book = database.books.find(b => 
            b.title.toLowerCase().includes(bookQuery.toLowerCase()) || 
            b.id === bookQuery.toUpperCase()
        );
        
        if (!book) {
            console.log('❌ Buku tidak ditemukan');
            return;
        }
        
        if (book.availableCopies <= 0) {
            console.log('❌ Buku sedang tidak tersedia');
            return;
        }
        
        // Buat transaksi
        const transaction = {
            id: Utils.generateId(),
            memberId: member.id,
            memberName: member.name,
            bookId: book.id,
            bookTitle: book.title,
            borrowDate: new Date().toISOString(),
            dueDate: new Date(Date.now() + CONFIG.MAX_BORROW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
            returnDate: null,
            status: 'borrowed',
            fine: 0
        };
        
        // Update data
        database.transactions.push(transaction);
        member.borrowedBooks.push(book.id);
        book.availableCopies--;
        book.available = book.availableCopies > 0;
        
        DataManager.updateStats();
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        
        console.log('\n✅ Peminjaman berhasil!');
        console.log(`📚 "${book.title}" dipinjam oleh ${member.name}`);
        console.log(`📅 Jatuh tempo: ${Utils.formatDate(new Date(transaction.dueDate))}`);
    }

    static async returnBook() {
        console.log('\n📥 KEMBALIKAN BUKU');
        
        const query = await BookManager.getInput('ID transaksi atau nama anggota: ');
        
        // Cari transaksi aktif
        const transactions = database.transactions.filter(t => 
            t.status === 'borrowed' && (
                t.id === query.toUpperCase() ||
                t.memberName.toLowerCase().includes(query.toLowerCase())
            )
        );
        
        if (transactions.length === 0) {
            console.log('❌ Tidak ada peminjaman aktif ditemukan');
            return;
        }
        
        if (transactions.length > 1) {
            console.log('\n📋 Peminjaman aktif:');
            transactions.forEach((t, index) => {
                const overdue = new Date(t.dueDate) < new Date();
                console.log(`${index + 1}. ${t.bookTitle} - ${t.memberName} ${overdue ? '⚠️ TERLAMBAT' : ''}`);
            });
            
            const choice = parseInt(await BookManager.getInput('Pilih nomor transaksi: ')) - 1;
            if (choice < 0 || choice >= transactions.length) {
                console.log('❌ Pilihan tidak valid');
                return;
            }
            
            await this.processReturn(transactions[choice]);
        } else {
            await this.processReturn(transactions[0]);
        }
    }

    static async processReturn(transaction) {
        const member = database.members.find(m => m.id === transaction.memberId);
        const book = database.books.find(b => b.id === transaction.bookId);
        
        const returnDate = new Date();
        const dueDate = new Date(transaction.dueDate);
        
        // Hitung denda jika terlambat
        let fine = 0;
        if (returnDate > dueDate) {
            const daysLate = Utils.calculateDaysDiff(dueDate, returnDate);
            fine = daysLate * CONFIG.FINE_PER_DAY;
        }
        
        // Update transaksi
        transaction.returnDate = returnDate.toISOString();
        transaction.status = 'returned';
        transaction.fine = fine;
        
        // Update member
        member.borrowedBooks = member.borrowedBooks.filter(id => id !== book.id);
        member.borrowHistory.push(transaction.id);
        member.fines += fine;
        
        // Update book
        book.availableCopies++;
        book.available = true;
        
        DataManager.updateStats();
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        
        console.log('\n✅ Pengembalian berhasil!');
        console.log(`📚 "${book.title}" dikembalikan oleh ${member.name}`);
        
        if (fine > 0) {
            console.log(`💰 Denda keterlambatan: ${Utils.formatCurrency(fine)}`);
        }
    }

    static async viewTransactions() {
        console.log('\n📊 RIWAYAT TRANSAKSI');
        
        if (database.transactions.length === 0) {
            console.log('📭 Belum ada transaksi');
            return;
        }
        
        const filter = await BookManager.getInput('Filter (all/borrowed/returned/overdue): ');
        let filteredTransactions = database.transactions;
        
        switch (filter.toLowerCase()) {
            case 'borrowed':
                filteredTransactions = database.transactions.filter(t => t.status === 'borrowed');
                break;
            case 'returned':
                filteredTransactions = database.transactions.filter(t => t.status === 'returned');
                break;
            case 'overdue':
                const today = new Date();
                filteredTransactions = database.transactions.filter(t => 
                    t.status === 'borrowed' && new Date(t.dueDate) < today
                );
                break;
        }
        
        console.log('='.repeat(100));
        filteredTransactions.forEach((t, index) => {
            const status = t.status === 'borrowed' ? 
                (new Date(t.dueDate) < new Date() ? '⚠️ TERLAMBAT' : '📤 DIPINJAM') : 
                '📥 KEMBALI';
            
            console.log(`${index + 1}. [${t.id}] ${t.bookTitle}`);
            console.log(`   👤 ${t.memberName} | ${status}`);
            console.log(`   📅 Pinjam: ${Utils.formatDate(new Date(t.borrowDate))}`);
            console.log(`   📅 Tempo: ${Utils.formatDate(new Date(t.dueDate))}`);
            
            if (t.returnDate) {
                console.log(`   📅 Kembali: ${Utils.formatDate(new Date(t.returnDate))}`);
            }
            
            if (t.fine > 0) {
                console.log(`   💰 Denda: ${Utils.formatCurrency(t.fine)}`);
            }
            
            console.log('-'.repeat(50));
        });
    }
}

// Search & Reports
class SearchManager {
    static async searchBooks() {
        console.log('\n🔍 PENCARIAN BUKU');
        
        const query = await BookManager.getInput('Kata kunci (judul/penulis/kategori): ');
        
        const results = database.books.filter(book => 
            Utils.searchText(book.title, query) ||
            Utils.searchText(book.author, query) ||
            Utils.searchText(book.category, query) ||
            Utils.searchText(book.isbn || '', query)
        );
        
        if (results.length === 0) {
            console.log('❌ Tidak ada buku yang ditemukan');
            return;
        }
        
        console.log(`\n📚 Ditemukan ${results.length} buku:`);
        console.log('='.repeat(80));
        
        results.forEach((book, index) => {
            const availability = book.available ? 
                `✅ Tersedia (${book.availableCopies}/${book.copies})` : 
                '❌ Tidak tersedia';
            
            console.log(`${index + 1}. "${book.title}" - ${book.author}`);
            console.log(`   🆔 ${book.id} | 📂 ${book.category} | 📅 ${book.year}`);
            console.log(`   ${availability} | 📍 ${book.location || 'Lokasi tidak ada'}`);
            
            if (book.description) {
                console.log(`   📝 ${book.description.substring(0, 100)}${book.description.length > 100 ? '...' : ''}`);
            }
            
            console.log('-'.repeat(40));
        });
    }

    static async generateReports() {
        console.log('\n📈 LAPORAN PERPUSTAKAAN');
        
        const reportType = await BookManager.getInput('Jenis laporan (stats/books/members/overdue): ');
        
        switch (reportType.toLowerCase()) {
            case 'stats':
                this.showStatistics();
                break;
            case 'books':
                this.showBooksReport();
                break;
            case 'members':
                this.showMembersReport();
                break;
            case 'overdue':
                this.showOverdueReport();
                break;
            default:
                console.log('❌ Jenis laporan tidak valid');
        }
    }

    static showStatistics() {
        console.log('\n📊 STATISTIK PERPUSTAKAAN');
        console.log('='.repeat(50));
        console.log(`📚 Total Buku: ${database.stats.totalBooks}`);
        console.log(`👥 Total Anggota: ${database.stats.totalMembers}`);
        console.log(`📋 Total Transaksi: ${database.stats.totalTransactions}`);
        console.log(`📤 Buku Dipinjam: ${database.stats.booksOnLoan}`);
        console.log(`⚠️ Buku Terlambat: ${database.stats.overdueBooks}`);
        
        // Kategori terpopuler
        const categoryCount = {};
        database.books.forEach(book => {
            categoryCount[book.category] = (categoryCount[book.category] || 0) + 1;
        });
        
        console.log('\n📂 Kategori Terpopuler:');
        Object.entries(categoryCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .forEach(([category, count]) => {
                console.log(`   ${category}: ${count} buku`);
            });
    }

    static showBooksReport() {
        console.log('\n📚 LAPORAN BUKU');
        console.log('='.repeat(80));
        
        database.books.forEach((book, index) => {
            console.log(`${index + 1}. "${book.title}" - ${book.author}`);
            console.log(`   Status: ${book.available ? '✅ Tersedia' : '❌ Dipinjam'}`);
            console.log(`   Eksemplar: ${book.availableCopies}/${book.copies}`);
            console.log(`   Kategori: ${book.category} | Tahun: ${book.year}`);
            console.log('-'.repeat(40));
        });
    }

    static showOverdueReport() {
        const overdueTransactions = DataManager.getOverdueBooks();
        
        if (overdueTransactions.length === 0) {
            console.log('✅ Tidak ada buku yang terlambat');
            return;
        }
        
        console.log('\n⚠️ LAPORAN KETERLAMBATAN');
        console.log('='.repeat(80));
        
        overdueTransactions.forEach((transaction, index) => {
            const daysLate = Utils.calculateDaysDiff(new Date(transaction.dueDate), new Date());
            const potentialFine = daysLate * CONFIG.FINE_PER_DAY;
            
            console.log(`${index + 1}. "${transaction.bookTitle}"`);
            console.log(`   Peminjam: ${transaction.memberName}`);
            console.log(`   Terlambat: ${daysLate} hari`);
            console.log(`   Denda: ${Utils.formatCurrency(potentialFine)}`);
            console.log('-'.repeat(40));
        });
    }
}

// Settings Management
class SettingsManager {
    static async showSettings() {
        console.log('\n⚙️ PENGATURAN SISTEM');
        console.log('='.repeat(50));
        console.log(`1. Maksimal hari peminjaman: ${CONFIG.MAX_BORROW_DAYS}`);
        console.log(`2. Maksimal buku per anggota: ${CONFIG.MAX_BOOKS_PER_USER}`);
        console.log(`3. Denda per hari: ${Utils.formatCurrency(CONFIG.FINE_PER_DAY)}`);
        console.log(`4. Auto-save: ${CONFIG.AUTO_SAVE ? 'Aktif' : 'Nonaktif'}`);
        console.log('5. Kelola kategori');
        console.log('6. Backup data');
        console.log('7. Restore data');
        
        const choice = await BookManager.getInput('Pilih pengaturan untuk diubah (1-7): ');
        
        switch (choice) {
            case '1':
                const newBorrowDays = parseInt(await BookManager.getInput('Hari peminjaman baru: '));
                if (newBorrowDays > 0) {
                    CONFIG.MAX_BORROW_DAYS = newBorrowDays;
                    console.log('✅ Pengaturan diperbarui');
                }
                break;
            case '2':
                const newMaxBooks = parseInt(await BookManager.getInput('Maksimal buku baru: '));
                if (newMaxBooks > 0) {
                    CONFIG.MAX_BOOKS_PER_USER = newMaxBooks;
                    console.log('✅ Pengaturan diperbarui');
                }
                break;
            case '3':
                const newFine = parseInt(await BookManager.getInput('Denda per hari baru (Rp): '));
                if (newFine >= 0) {
                    CONFIG.FINE_PER_DAY = newFine;
                    console.log('✅ Pengaturan diperbarui');
                }
                break;
            case '4':
                CONFIG.AUTO_SAVE = !CONFIG.AUTO_SAVE;
                console.log(`✅ Auto-save ${CONFIG.AUTO_SAVE ? 'diaktifkan' : 'dinonaktifkan'}`);
                break;
            case '5':
                await this.manageCategories();
                break;
            case '6':
                DataManager.saveData();
                break;
            case '7':
                await this.restoreData();
                break;
        }
    }

    static async manageCategories() {
        console.log('\n📂 KELOLA KATEGORI');
        console.log('Kategori saat ini:');
        database.categories.forEach((cat, index) => {
            console.log(`${index + 1}. ${cat}`);
        });
        
        const action = await BookManager.getInput('Aksi (add/remove): ');
        
        if (action.toLowerCase() === 'add') {
            const newCategory = await BookManager.getInput('Nama kategori baru: ');
            if (newCategory && !database.categories.includes(newCategory)) {
                database.categories.push(newCategory);
                console.log('✅ Kategori ditambahkan');
            }
        } else if (action.toLowerCase() === 'remove') {
            const categoryName = await BookManager.getInput('Nama kategori yang akan dihapus: ');
            const index = database.categories.indexOf(categoryName);
            if (index > -1) {
                database.categories.splice(index, 1);
                console.log('✅ Kategori dihapus');
            }
        }
    }

    static async restoreData() {
        console.log('\n🔄 RESTORE DATA');
        
        if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
            console.log('❌ Tidak ada backup ditemukan');
            return;
        }
        
        const backupFiles = fs.readdirSync(CONFIG.BACKUP_DIR).filter(f => f.endsWith('.json'));
        
        if (backupFiles.length === 0) {
            console.log('❌ Tidak ada file backup');
            return;
        }
        
        console.log('File backup tersedia:');
        backupFiles.forEach((file, index) => {
            const stats = fs.statSync(path.join(CONFIG.BACKUP_DIR, file));
            console.log(`${index + 1}. ${file} - ${Utils.formatDate(stats.mtime)}`);
        });
        
        const choice = parseInt(await BookManager.getInput('Pilih file backup: ')) - 1;
        
        if (choice >= 0 && choice < backupFiles.length) {
            try {
                const backupPath = path.join(CONFIG.BACKUP_DIR, backupFiles[choice]);
                const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
                
                const confirm = await BookManager.getInput('⚠️ Ini akan mengganti semua data. Lanjutkan? (y/N): ');
                if (confirm.toLowerCase() === 'y') {
                      // Melengkapi function restoreData yang terpotong
                    database = { ...database, ...backupData };
                    DataManager.updateStats();
                    console.log('✅ Data berhasil direstore');
                    DataManager.saveData();
                }
            } catch (error) {
                console.log('❌ Gagal restore data:', error.message);
            }
        }
    }
}

// Fine Management - Sistem manajemen denda
class FineManager {
    static async viewFines() {
        console.log('\n💰 MANAJEMEN DENDA');
        
        const membersWithFines = database.members.filter(m => m.fines > 0);
        
        if (membersWithFines.length === 0) {
            console.log('✅ Tidak ada anggota yang memiliki denda');
            return;
        }
        
        console.log('='.repeat(80));
        membersWithFines.forEach((member, index) => {
            console.log(`${index + 1}. ${member.name} (${member.id})`);
            console.log(`   📧 ${member.email} | 📱 ${member.phone}`);
            console.log(`   💰 Total Denda: ${Utils.formatCurrency(member.fines)}`);
            console.log(`   📚 Buku Dipinjam: ${member.borrowedBooks.length}`);
            console.log('-'.repeat(40));
        });
        
        const action = await BookManager.getInput('\nAksi (pay/detail/back): ');
        
        switch (action.toLowerCase()) {
            case 'pay':
                await this.payFine(membersWithFines);
                break;
            case 'detail':
                await this.showFineDetail(membersWithFines);
                break;
        }
    }
    
    static async payFine(membersWithFines) {
        const memberIndex = parseInt(await BookManager.getInput('Pilih nomor anggota: ')) - 1;
        
        if (memberIndex < 0 || memberIndex >= membersWithFines.length) {
            console.log('❌ Pilihan tidak valid');
            return;
        }
        
        const member = membersWithFines[memberIndex];
        console.log(`💰 Total denda ${member.name}: ${Utils.formatCurrency(member.fines)}`);
        
        const amount = parseFloat(await BookManager.getInput('Jumlah pembayaran: '));
        
        if (amount <= 0 || amount > member.fines) {
            console.log('❌ Jumlah pembayaran tidak valid');
            return;
        }
        
        member.fines -= amount;
        
        // Catat pembayaran
        const payment = {
            id: Utils.generateId(),
            memberId: member.id,
            memberName: member.name,
            amount: amount,
            date: new Date().toISOString(),
            type: 'fine_payment'
        };
        
        if (!database.payments) database.payments = [];
        database.payments.push(payment);
        
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        
        console.log(`✅ Pembayaran sebesar ${Utils.formatCurrency(amount)} berhasil dicatat`);
        console.log(`💰 Sisa denda: ${Utils.formatCurrency(member.fines)}`);
    }
    
    static async showFineDetail(membersWithFines) {
        const memberIndex = parseInt(await BookManager.getInput('Pilih nomor anggota: ')) - 1;
        
        if (memberIndex < 0 || memberIndex >= membersWithFines.length) {
            console.log('❌ Pilihan tidak valid');
            return;
        }
        
        const member = membersWithFines[memberIndex];
        const overdueTransactions = database.transactions.filter(t => 
            t.memberId === member.id && t.status === 'borrowed' && new Date(t.dueDate) < new Date()
        );
        
        console.log(`\n📋 Detail Denda - ${member.name}`);
        console.log('='.repeat(60));
        
        overdueTransactions.forEach((transaction, index) => {
            const daysLate = Utils.calculateDaysDiff(new Date(transaction.dueDate), new Date());
            const fine = daysLate * CONFIG.FINE_PER_DAY;
            
            console.log(`${index + 1}. "${transaction.bookTitle}"`);
            console.log(`   Terlambat: ${daysLate} hari`);
            console.log(`   Denda: ${Utils.formatCurrency(fine)}`);
            console.log('-'.repeat(30));
        });
    }
}

// Enhanced Book Management dengan fitur tambahan
class EnhancedBookManager extends BookManager {
    static async importBooks() {
        console.log('\n📥 IMPORT BUKU DARI CSV');
        
        const filename = await this.getInput('Nama file CSV: ');
        
        try {
            if (!fs.existsSync(filename)) {
                console.log('❌ File tidak ditemukan');
                return;
            }
            
            const csvData = fs.readFileSync(filename, 'utf8');
            const lines = csvData.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                console.log('❌ File CSV tidak valid');
                return;
            }
            
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            let importedCount = 0;
            
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                
                if (values.length !== headers.length) continue;
                
                const bookData = {
                    id: Utils.generateId(),
                    title: values[headers.indexOf('title')] || 'Unknown',
                    author: values[headers.indexOf('author')] || 'Unknown',
                    isbn: values[headers.indexOf('isbn')] || '',
                    category: values[headers.indexOf('category')] || 'Lainnya',
                    publisher: values[headers.indexOf('publisher')] || '',
                    year: parseInt(values[headers.indexOf('year')]) || new Date().getFullYear(),
                    pages: parseInt(values[headers.indexOf('pages')]) || 0,
                    copies: parseInt(values[headers.indexOf('copies')]) || 1,
                    available: true,
                    availableCopies: parseInt(values[headers.indexOf('copies')]) || 1,
                    addedDate: new Date().toISOString(),
                    description: values[headers.indexOf('description')] || '',
                    location: values[headers.indexOf('location')] || ''
                };
                
                database.books.push(bookData);
                importedCount++;
            }
            
            DataManager.updateStats();
            if (CONFIG.AUTO_SAVE) DataManager.saveData();
            
            console.log(`✅ Berhasil mengimpor ${importedCount} buku`);
            
        } catch (error) {
            console.log('❌ Gagal mengimpor buku:', error.message);
        }
    }
    
    static async exportBooks() {
        console.log('\n📤 EXPORT BUKU KE CSV');
        
        if (database.books.length === 0) {
            console.log('❌ Tidak ada buku untuk diekspor');
            return;
        }
        
        const filename = await this.getInput('Nama file output (tanpa .csv): ') + '.csv';
        
        try {
            const headers = ['id', 'title', 'author', 'isbn', 'category', 'publisher', 'year', 'pages', 'copies', 'available_copies', 'location', 'description'];
            let csvContent = headers.join(',') + '\n';
            
            database.books.forEach(book => {
                const row = [
                    book.id,
                    `"${book.title}"`,
                    `"${book.author}"`,
                    book.isbn || '',
                    book.category,
                    `"${book.publisher}"`,
                    book.year,
                    book.pages,
                    book.copies,
                    book.availableCopies,
                    `"${book.location || ''}"`,
                    `"${book.description || ''}"`
                ];
                csvContent += row.join(',') + '\n';
            });
            
            fs.writeFileSync(filename, csvContent);
            console.log(`✅ Data buku berhasil diekspor ke ${filename}`);
            
        } catch (error) {
            console.log('❌ Gagal mengekspor buku:', error.message);
        }
    }
    
    static async bookReservation() {
        console.log('\n📝 RESERVASI BUKU');
        
        const memberId = await this.getInput('ID atau nama anggota: ');
        const member = database.members.find(m => 
            m.id === memberId.toUpperCase() || 
            m.name.toLowerCase().includes(memberId.toLowerCase())
        );
        
        if (!member) {
            console.log('❌ Anggota tidak ditemukan');
            return;
        }
        
        const bookQuery = await this.getInput('Judul atau ID buku: ');
        const book = database.books.find(b => 
            b.title.toLowerCase().includes(bookQuery.toLowerCase()) || 
            b.id === bookQuery.toUpperCase()
        );
        
        if (!book) {
            console.log('❌ Buku tidak ditemukan');
            return;
        }
        
        if (book.availableCopies > 0) {
            console.log('📚 Buku tersedia, tidak perlu reservasi');
            return;
        }
        
        // Buat reservasi
        if (!database.reservations) database.reservations = [];
        
        const reservation = {
            id: Utils.generateId(),
            memberId: member.id,
            memberName: member.name,
            bookId: book.id,
            bookTitle: book.title,
            reservationDate: new Date().toISOString(),
            status: 'active'
        };
        
        database.reservations.push(reservation);
        
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        
        console.log(`✅ Reservasi berhasil dibuat untuk "${book.title}"`);
        console.log(`🆔 ID Reservasi: ${reservation.id}`);
    }
    
    static async viewReservations() {
        if (!database.reservations || database.reservations.length === 0) {
            console.log('📭 Tidak ada reservasi aktif');
            return;
        }
        
        console.log('\n📝 DAFTAR RESERVASI');
        console.log('='.repeat(80));
        
        const activeReservations = database.reservations.filter(r => r.status === 'active');
        
        activeReservations.forEach((reservation, index) => {
            console.log(`${index + 1}. "${reservation.bookTitle}"`);
            console.log(`   👤 ${reservation.memberName} (${reservation.memberId})`);
            console.log(`   📅 ${Utils.formatDate(new Date(reservation.reservationDate))}`);
            console.log(`   🆔 ${reservation.id}`);
            console.log('-'.repeat(40));
        });
    }
}

// Advanced Search dengan filter lebih detail
class AdvancedSearch extends SearchManager {
    static async advancedSearch() {
        console.log('\n🔍 PENCARIAN LANJUTAN');
        
        const filters = {};
        
        console.log('Filter pencarian (kosongkan jika tidak ingin menggunakan):');
        
        filters.title = await BookManager.getInput('Judul: ');
        filters.author = await BookManager.getInput('Penulis: ');
        filters.category = await BookManager.getInput('Kategori: ');
        filters.yearFrom = parseInt(await BookManager.getInput('Tahun dari: ')) || 0;
        filters.yearTo = parseInt(await BookManager.getInput('Tahun sampai: ')) || 9999;
        filters.availability = await BookManager.getInput('Status (available/borrowed/all): ');
        
        let results = database.books.filter(book => {
            if (filters.title && !Utils.searchText(book.title, filters.title)) return false;
            if (filters.author && !Utils.searchText(book.author, filters.author)) return false;
            if (filters.category && !Utils.searchText(book.category, filters.category)) return false;
            if (book.year < filters.yearFrom || book.year > filters.yearTo) return false;
            
            if (filters.availability === 'available' && !book.available) return false;
            if (filters.availability === 'borrowed' && book.available) return false;
            
            return true;
        });
        
        if (results.length === 0) {
            console.log('❌ Tidak ada buku yang sesuai dengan kriteria');
            return;
        }
        
        console.log(`\n📚 Ditemukan ${results.length} buku:`);
        console.log('='.repeat(80));
        
        results.forEach((book, index) => {
            console.log(`${index + 1}. "${book.title}" - ${book.author}`);
            console.log(`   🆔 ${book.id} | 📂 ${book.category} | 📅 ${book.year}`);
            console.log(`   Status: ${book.available ? '✅ Tersedia' : '❌ Dipinjam'}`);
            console.log(`   📍 ${book.location || 'Lokasi tidak ada'}`);
            console.log('-'.repeat(40));
        });
    }
}

// Notification System - Sistem notifikasi untuk buku yang akan jatuh tempo
class NotificationSystem {
    static checkUpcomingDueDates() {
        const today = new Date();
        const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
        
        const upcomingDue = database.transactions.filter(t => 
            t.status === 'borrowed' && 
            new Date(t.dueDate) >= today && 
            new Date(t.dueDate) <= threeDaysFromNow
        );
        
        if (upcomingDue.length > 0) {
            console.log('\n🔔 PERINGATAN JATUH TEMPO');
            console.log('='.repeat(60));
            
            upcomingDue.forEach(transaction => {
                const daysLeft = Utils.calculateDaysDiff(today, new Date(transaction.dueDate));
                console.log(`⚠️ "${transaction.bookTitle}"`);
                console.log(`   Peminjam: ${transaction.memberName}`);
                console.log(`   Jatuh tempo: ${daysLeft} hari lagi`);
                console.log('-'.repeat(30));
            });
        }
        
        return upcomingDue.length;
    }
    
    static showOverdueNotifications() {
        const overdueBooks = DataManager.getOverdueBooks();
        
        if (overdueBooks.length > 0) {
            console.log('\n🚨 BUKU TERLAMBAT');
            console.log('='.repeat(60));
            
            overdueBooks.forEach(transaction => {
                const daysLate = Utils.calculateDaysDiff(new Date(transaction.dueDate), new Date());
                const fine = daysLate * CONFIG.FINE_PER_DAY;
                
                console.log(`🚨 "${transaction.bookTitle}"`);
                console.log(`   Peminjam: ${transaction.memberName}`);
                console.log(`   Terlambat: ${daysLate} hari`);
                console.log(`   Denda: ${Utils.formatCurrency(fine)}`);
                console.log('-'.repeat(30));
            });
        }
        
        return overdueBooks.length;
    }
}

// Main Menu yang sudah diperbaiki
function showMainMenu() {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    📚 SISTEM MANAJEMEN PERPUSTAKAAN 📚        ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  📖 MANAJEMEN BUKU:                                           ║');
    console.log('║    1. Tambah Buku Baru          11. Import Buku dari CSV      ║');
    console.log('║    2. Edit Buku                 12. Export Buku ke CSV        ║');
    console.log('║    3. Hapus Buku                13. Reservasi Buku            ║');
    console.log('║    4. Lihat Semua Buku          14. Lihat Reservasi           ║');
    console.log('║                                                               ║');
    console.log('║  👥 MANAJEMEN ANGGOTA:                                        ║');
    console.log('║    5. Tambah Anggota            15. Edit Anggota              ║');
    console.log('║    6. Lihat Anggota             16. Hapus Anggota             ║');
    console.log('║                                                               ║');
    console.log('║  📋 TRANSAKSI:                                                ║');
    console.log('║    7. Pinjam Buku               17. Perpanjang Peminjaman     ║');
    console.log('║    8. Kembalikan Buku           18. Riwayat Transaksi         ║');
    console.log('║                                                               ║');
    console.log('║  🔍 PENCARIAN & LAPORAN:                                      ║');
    console.log('║    9. Cari Buku                 19. Pencarian Lanjutan        ║');
    console.log('║    10. Laporan                  20. Laporan Keuangan          ║');
    console.log('║                                                               ║');
    console.log('║  💰 MANAJEMEN DENDA:            ⚙️ SISTEM:                    ║');
    console.log('║    21. Kelola Denda             25. Pengaturan                ║');
    console.log('║    22. Riwayat Pembayaran       26. Backup & Restore          ║');
    console.log('║                                 27. Tentang Sistem            ║');
    console.log('║  🔔 NOTIFIKASI:                                               ║');
    console.log('║    23. Cek Jatuh Tempo          0. Keluar                     ║');
    console.log('║    24. Buku Terlambat                                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    
    // Tampilkan statistik singkat
    console.log(`\n📊 Status: ${database.stats.totalBooks} Buku | ${database.stats.totalMembers} Anggota | ${database.stats.booksOnLoan} Dipinjam | ${database.stats.overdueBooks} Terlambat`);
    
    // Notifikasi otomatis
    const upcomingDue = NotificationSystem.checkUpcomingDueDates();
    const overdue = NotificationSystem.showOverdueNotifications();
    
    if (upcomingDue === 0 && overdue === 0) {
        console.log('✅ Tidak ada notifikasi penting');
    }
}

// [Fungsi-fungsi lain dan main loop tetap sama]

async function handleMenuChoice(choice) {
    switch (choice) {
        case '1': await BookManager.addBook(); break;
        case '2': await BookManager.editBook(); break;
        case '3': await BookManager.deleteBook(); break;
        case '4': await SearchManager.searchBooks(); break;
        case '5': await MemberManager.addMember(); break;
        case '6': await MemberManager.viewMembers(); break;
        case '7': await TransactionManager.borrowBook(); break;
        case '8': await TransactionManager.returnBook(); break;
        case '9': await SearchManager.searchBooks(); break;
        case '10': await SearchManager.generateReports(); break;
        case '11': await EnhancedBookManager.importBooks(); break;
        case '12': await EnhancedBookManager.exportBooks(); break;
        case '13': await EnhancedBookManager.bookReservation(); break;
        case '14': await EnhancedBookManager.viewReservations(); break;
        case '15': await MemberManager.editMember(); break;
        case '16': await MemberManager.deleteMember(); break;
        case '17': await TransactionManager.extendLoan(); break;
        case '18': await TransactionManager.viewTransactions(); break;
        case '19': await AdvancedSearch.advancedSearch(); break;
        case '20': await generateFinancialReport(); break;
        case '21': await FineManager.viewFines(); break;
        case '22': await viewPaymentHistory(); break;
        case '23': NotificationSystem.checkUpcomingDueDates(); break;
        case '24': NotificationSystem.showOverdueNotifications(); break;
        case '25': await SettingsManager.showSettings(); break;
        case '26': await backupAndRestore(); break;
        case '27': showAbout(); break;
        case '0': 
            console.log('\n👋 Terima kasih telah menggunakan Sistem Manajemen Perpustakaan!');
            if (CONFIG.AUTO_SAVE) DataManager.saveData();
            rl.close();
            process.exit(0);
            break;
        default:
            console.log('❌ Pilihan tidak valid');
    }
}

// Fungsi tambahan yang hilang
async function generateFinancialReport() {
    console.log('\n💰 LAPORAN KEUANGAN');
    console.log('='.repeat(60));
    
    const totalFines = database.members.reduce((sum, member) => sum + member.fines, 0);
    const totalPayments = database.payments ? 
        database.payments.reduce((sum, payment) => sum + payment.amount, 0) : 0;
    
    console.log(`💰 Total Denda Tertunggak: ${Utils.formatCurrency(totalFines)}`);
    console.log(`💳 Total Pembayaran Diterima: ${Utils.formatCurrency(totalPayments)}`);
    console.log(`📊 Pendapatan Bersih: ${Utils.formatCurrency(totalPayments)}`);
    
    // Grafik sederhana pembayaran per bulan (6 bulan terakhir)
    if (database.payments && database.payments.length > 0) {
        console.log('\n📈 Pembayaran 6 Bulan Terakhir:');
        const monthlyPayments = {};
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        database.payments
            .filter(p => new Date(p.date) >= sixMonthsAgo)
            .forEach(payment => {
                const month = new Date(payment.date).toLocaleDateString('id-ID', { 
                    year: 'numeric', 
                    month: 'short' 
                });
                monthlyPayments[month] = (monthlyPayments[month] || 0) + payment.amount;
            });
        
        Object.entries(monthlyPayments).forEach(([month, amount]) => {
            const bars = '█'.repeat(Math.ceil(amount / 10000));
            console.log(`${month}: ${Utils.formatCurrency(amount)} ${bars}`);
        });
    }
}

async function viewPaymentHistory() {
    if (!database.payments || database.payments.length === 0) {
        console.log('📭 Belum ada riwayat pembayaran');
        return;
    }
    
    console.log('\n💳 RIWAYAT PEMBAYARAN');
    console.log('='.repeat(80));
    
    database.payments
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach((payment, index) => {
            console.log(`${index + 1}. ${payment.memberName} - ${Utils.formatCurrency(payment.amount)}`);
            console.log(`   📅 ${Utils.formatDate(new Date(payment.date))}`);
            console.log(`   🆔 ${payment.id}`);
            console.log('-'.repeat(40));
        });
}

async function backupAndRestore() {
    console.log('\n💾 BACKUP & RESTORE');
    console.log('1. Buat Backup Manual');
    console.log('2. Restore dari Backup');
    console.log('3. Lihat Semua Backup');
    console.log('4. Hapus Backup Lama');
    
    const choice = await BookManager.getInput('Pilihan: ');
    
    switch (choice) {
        case '1':
            DataManager.saveData();
            break;
        case '2':
            await SettingsManager.restoreData();
            break;
        case '3':
            await listBackups();
            break;
        case '4':
            await cleanOldBackups();
            break;
    }
}

async function listBackups() {
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
        console.log('❌ Direktori backup tidak ditemukan');
        return;
    }
    
    const backupFiles = fs.readdirSync(CONFIG.BACKUP_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const stats = fs.statSync(path.join(CONFIG.BACKUP_DIR, f));
            return {
                name: f,
                size: stats.size,
                date: stats.mtime
            };
        })
        .sort((a, b) => b.date - a.date);
    
    if (backupFiles.length === 0) {
        console.log('❌ Tidak ada file backup');
        return;
    }
    
    console.log('\n📁 DAFTAR BACKUP');
    console.log('='.repeat(80));
    
    backupFiles.forEach((file, index) => {
        const sizeKB = (file.size / 1024).toFixed(2);
        console.log(`${index + 1}. ${file.name}`);
        console.log(`   📅 ${Utils.formatDate(file.date)} | 📊 ${sizeKB} KB`);
        console.log('-'.repeat(40));
    });
}

async function cleanOldBackups() {
    const keepDays = parseInt(await BookManager.getInput('Hapus backup lebih dari berapa hari? ')) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) return;
    
    const backupFiles = fs.readdirSync(CONFIG.BACKUP_DIR).filter(f => f.endsWith('.json'));
    let deletedCount = 0;
    
    backupFiles.forEach(file => {
        const filePath = path.join(CONFIG.BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
        }
    });
    
    console.log(`✅ ${deletedCount} file backup lama berhasil dihapus`);
}

function showAbout() {
    console.log('\n📚 TENTANG SISTEM MANAJEMEN PERPUSTAKAAN');
    console.log('='.repeat(60));
    console.log('📌 Versi: 2.0.0');
    console.log('👨‍💻 Developer: Library Management System');
    console.log('📅 Dibuat: 2024');
    console.log('🎯 Fitur:');
    console.log('   • Manajemen Buku & Anggota');
    console.log('   • Sistem Peminjaman & Pengembalian');
    console.log('   • Manajemen Denda & Pembayaran');
    console.log('   • Reservasi Buku');
    console.log('   • Import/Export CSV');
    console.log('   • Pencarian Lanjutan');
    console.log('   • Laporan & Statistik');
    console.log('   • Backup & Restore');
    console.log('   • Sistem Notifikasi');
    console.log('\n🔧 Teknologi: Node.js, JavaScript');
    console.log('📄 Format Data: JSON');
    console.log('💾 Auto-Save: ' + (CONFIG.AUTO_SAVE ? 'Aktif' : 'Nonaktif'));
}


// Main function dengan error handling yang lebih baik
async function main() {
    try {
        console.log('🚀 Memulai Sistem Manajemen Perpustakaan...');
        
        // Load data saat startup
        if (!DataManager.loadData()) {
            console.log('ℹ️ Membuat database baru...');
        }
        
        while (true) {
            showMainMenu();
            const choice = await BookManager.getInput('\n🎯 Pilih menu (0-27): ');
            
            console.clear();
            await handleMenuChoice(choice);
            
            if (choice !== '0') {
                await BookManager.getInput('\n📱 Tekan Enter untuk melanjutkan...');
            }
        }
    } catch (error) {
        console.error('❌ Terjadi kesalahan fatal:', error.message);
        if (CONFIG.AUTO_SAVE) DataManager.saveData();
        process.exit(1);
    }
}

// Jalankan aplikasi
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Terjadi kesalahan:', error.message);
        process.exit(1);
    });
}

// Export untuk testing
module.exports = {
    Utils,
    DataManager,
    BookManager,
    MemberManager,
    TransactionManager,
    SearchManager,
    SettingsManager,
    FineManager,
    EnhancedBookManager,
    AdvancedSearch,
    NotificationSystem,
    CONFIG,
    database,
    showMainMenu,
    handleMenuChoice
};
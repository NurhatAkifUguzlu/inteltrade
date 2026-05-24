import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch, addDoc, query, orderBy, onSnapshot, updateDoc, arrayUnion, arrayRemove, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCp8nuLZF0RG5-ubYFzcRhgwxDUAp3S_14",
    authDomain: "kartopu-95851.firebaseapp.com",
    projectId: "kartopu-95851",
    storageBucket: "kartopu-95851.firebasestorage.app",
    messagingSenderId: "641549698631",
    appId: "1:641549698631:web:831f863ab33bb2a2fad362"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    // Auth DOM
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const authForm = document.getElementById('auth-form');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authError = document.getElementById('auth-error');
    const authSubmitBtn = document.getElementById('auth-submit-btn');

    let userMetrics = { winRate: 'N/A', roi: 'N/A' };
    const winRateDisplay = document.getElementById('win-rate-display');
    const csvUpload = document.getElementById('csv-upload');

    const composeForm = document.getElementById('compose-post-form');
    const feedList = document.getElementById('social-feed-list');

    // App DOM
    const headerUserEmail = document.getElementById('header-user-email');
    const userEmailDisplay = document.getElementById('user-email');
    const netWorthDisplay = document.getElementById('net-worth-display');
    const btnLogout = document.getElementById('btn-logout');

    // Timeline DOM
    const timeline = document.getElementById('timeline');
    const fabAdd = document.getElementById('fab-add');
    const modal = document.getElementById('add-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const form = document.getElementById('investment-form');

    // Modal Form inputs
    const editIndexInput = document.getElementById('edit-index');
    const dateInput = document.getElementById('inv-date');
    const nameInput = document.getElementById('inv-name');
    const initialInput = document.getElementById('inv-initial');
    const finalInput = document.getElementById('inv-final');
    const modalTitle = document.getElementById('modal-title');
    const submitBtn = document.getElementById('submit-btn');

    let investments = [];
    let currentUser = null;
    let isLoginMode = true;

    // Auth UI Toggles
    tabLogin.addEventListener('click', () => {
        isLoginMode = true;
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        authSubmitBtn.textContent = 'Giriş Yap';
        authError.classList.add('hidden');
    });

    tabSignup.addEventListener('click', () => {
        isLoginMode = false;
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitBtn.textContent = 'Kayıt Ol';
        authError.classList.add('hidden');
    });

    // Handle Auth Submit
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = authEmail.value;
        const password = authPassword.value;
        authError.classList.add('hidden');
        authSubmitBtn.disabled = true;

        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            authForm.reset();
        } catch (error) {
            authError.textContent = error.message;
            authError.classList.remove('hidden');
        } finally {
            authSubmitBtn.disabled = false;
        }
    });

    // Handle Logout
    btnLogout.addEventListener('click', () => {
        signOut(auth);
    });

    // Listen to Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            if (headerUserEmail) headerUserEmail.textContent = user.email;
            if (userEmailDisplay) userEmailDisplay.textContent = user.email;
            authView.classList.add('hidden');
            appView.classList.remove('hidden');

            await fetchProfile();
            await fetchInvestments();
            loadSocialFeed();
            loadPortfolioFeed();
        } else {
            currentUser = null;
            if (currentFeedUnsubscribe) currentFeedUnsubscribe();
            if (portfolioFeedUnsubscribe) portfolioFeedUnsubscribe();
            if (currentProfileUnsubscribe) currentProfileUnsubscribe();
            authView.classList.remove('hidden');
            appView.classList.add('hidden');
            investments = [];
            renderTimeline();
        }
    });

    // Fetch from Firestore
    async function fetchInvestments() {
        if (!currentUser) return;
        try {
            const querySnapshot = await getDocs(collection(db, "users", currentUser.uid, "investments"));
            investments = [];
            querySnapshot.forEach((docSnap) => {
                investments.push(docSnap.data());
            });
            recalculateChain();
            renderTimeline();
        } catch (e) {
            console.error("Error fetching documents: ", e);
        }
    }

    // Save to Firestore
    async function saveInvestments() {
        if (!currentUser) return;
        try {
            const batch = writeBatch(db);
            investments.forEach((inv) => {
                const docRef = doc(db, "users", currentUser.uid, "investments", inv.id);
                batch.set(docRef, inv);
            });
            await batch.commit();
        } catch (e) {
            console.error("Error saving documents: ", e);
        }
    }

    // Formatting currency
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(val);
    };

    // Format date
    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        const d = new Date(dateString);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        return d.toLocaleDateString('en-US', options);
    };

    function renderTimeline() {
        timeline.innerHTML = '';

        // Update Net Worth
        let totalNet = 0;
        if (investments.length > 0) {
            totalNet = investments[investments.length - 1].final;
        }
        netWorthDisplay.textContent = formatCurrency(totalNet);

        if (investments.length === 0) {
            timeline.innerHTML = '<div class="empty-state">Henüz yatırım yok.<br>Kartopunuzu başlatmak için + butonuna tıklayın!</div>';
            return;
        }

        investments.forEach((inv, index) => {
            const node = document.createElement('div');
            node.className = 'timeline-node';
            node.style.animationDelay = `${index * 0.08}s`;

            const profitClass = inv.profit > 0 ? 'profit-positive' : (inv.profit < 0 ? 'profit-negative' : 'profit-neutral');
            const profitSign = inv.profit > 0 ? '+' : '';

            node.innerHTML = `
                <div class="node-date">${formatDate(inv.date)}</div>
                <div class="node-header">
                    <div class="node-title">${inv.name}</div>
                    <div class="node-profit ${profitClass}">
                        ${profitSign}${formatCurrency(inv.profit)}
                        <span class="profit-percent">${profitSign}${inv.profitPercent.toFixed(2)}%</span>
                    </div>
                </div>
                <div class="node-details">
                    <div class="detail-item">
                        <span class="detail-label">Başlangıç Sermayesi</span>
                        <span class="detail-value">${formatCurrency(inv.initial)}</span>
                    </div>
                    <div class="detail-item" style="text-align: right;">
                        <span class="detail-label">Son Değer</span>
                        <span class="detail-value">${formatCurrency(inv.final)}</span>
                    </div>
                </div>
                <div class="node-actions">
                    <button class="btn-action btn-edit" data-index="${index}">Düzenle</button>
                    <button class="btn-action btn-delete" data-index="${index}">Sil</button>
                </div>
            `;

            timeline.appendChild(node);
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => handleEdit(e.target.dataset.index));
        });
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => handleDelete(e.target.dataset.index));
        });
    }

    function recalculateChain() {
        investments.sort((a, b) => new Date(a.date) - new Date(b.date));

        for (let i = 1; i < investments.length; i++) {
            investments[i].initial = investments[i - 1].final;
            investments[i].profit = investments[i].final - investments[i].initial;
            investments[i].profitPercent = (investments[i].initial > 0) ? (investments[i].profit / investments[i].initial) * 100 : 0;
        }
    }

    function openModal(isEdit = false) {
        modal.classList.add('active');
        if (!isEdit) {
            modalTitle.textContent = 'Yatırım Ekle';
            submitBtn.textContent = 'Yatırımı Kaydet';
            editIndexInput.value = '-1';

            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;

            if (investments.length > 0) {
                const sorted = [...investments].sort((a, b) => new Date(a.date) - new Date(b.date));
                const lastInvestment = sorted[sorted.length - 1];
                initialInput.value = lastInvestment.final.toFixed(2);
            } else {
                initialInput.value = '';
            }
            nameInput.value = '';
            finalInput.value = '';
        } else {
            modalTitle.textContent = 'Yatırımı Düzenle';
            submitBtn.textContent = 'Yatırımı Güncelle';
        }

        nameInput.focus();
    }

    function closeAddModal() {
        modal.classList.remove('active');
        form.reset();
    }

    function handleEdit(index) {
        const inv = investments[index];
        editIndexInput.value = index;
        dateInput.value = inv.date;
        nameInput.value = inv.name;
        initialInput.value = inv.initial.toFixed(2);
        finalInput.value = inv.final.toFixed(2);
        openModal(true);
    }

    async function handleDelete(index) {
        if (confirm('Bu yatırımı silmek istediğinize emin misiniz?')) {
            const deletedId = investments[index].id;
            investments.splice(index, 1);
            recalculateChain();
            renderTimeline();

            if (currentUser && deletedId) {
                try {
                    await deleteDoc(doc(db, "users", currentUser.uid, "investments", deletedId));
                } catch (e) {
                    console.error("Error deleting doc: ", e);
                }
            }
            await saveInvestments();
        }
    }

    fabAdd.addEventListener('click', () => openModal(false));
    closeModalBtn.addEventListener('click', closeAddModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeAddModal();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const index = parseInt(editIndexInput.value);
        const date = dateInput.value;
        const name = nameInput.value;
        const initial = parseFloat(initialInput.value);
        const final = parseFloat(finalInput.value);

        const profit = final - initial;
        const profitPercent = (initial > 0) ? (profit / initial) * 100 : 0;

        const newInv = {
            id: index === -1 ? Date.now().toString() : investments[index].id,
            date,
            name,
            initial,
            final,
            profit,
            profitPercent
        };

        if (index === -1) {
            investments.push(newInv);
        } else {
            investments[index] = newInv;
        }

        recalculateChain();
        renderTimeline();
        closeAddModal();

        await saveInvestments();
    });

    // Nav Toggles
    const btnTabPortfolio = document.getElementById('btn-tab-portfolio');
    const btnTabDiscover = document.getElementById('btn-tab-discover');
    const portfolioPage = document.getElementById('portfolio-page');
    const discoverPage = document.getElementById('discover-page');

    // -- Stage 3: CSV & Social Feed Logic --

    async function fetchProfile() {
        if (!currentUser) return;
        try {
            const docRef = doc(db, "users", currentUser.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().winRate) {
                userMetrics.winRate = docSnap.data().winRate;
                userMetrics.roi = docSnap.data().roi;
                if (winRateDisplay) winRateDisplay.textContent = `${userMetrics.winRate}%`;
            }
        } catch (e) { console.error(e); }
    }

    if (csvUpload) {
        csvUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const text = event.target.result;
                const lines = text.split('\n');

                let profitable = 0;
                let total = 0;
                let totalProfit = 0;
                let totalCapital = 0;

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const [asset, buyStr, sellStr] = line.split(',');
                    if (!asset || !buyStr || !sellStr) continue;

                    const buy = parseFloat(buyStr);
                    const sell = parseFloat(sellStr);
                    if (isNaN(buy) || isNaN(sell)) continue;

                    total++;
                    totalCapital += buy;
                    const profit = sell - buy;
                    totalProfit += profit;
                    if (profit > 0) profitable++;
                }

                if (total > 0) {
                    const winRate = ((profitable / total) * 100).toFixed(1);
                    const roi = ((totalProfit / totalCapital) * 100).toFixed(1);

                    if (currentUser) {
                        try {
                            await setDoc(doc(db, "users", currentUser.uid), { winRate, roi }, { merge: true });
                            userMetrics = { winRate, roi };
                            if (winRateDisplay) winRateDisplay.textContent = `${winRate}%`;
                            alert(`CSV Yüklendi!\nİşlemler: ${total}\nKazanma Oranı: %${winRate}\nROI: %${roi}`);
                        } catch (err) {
                            alert('Profil istatistikleri kaydedilirken hata oluştu.');
                        }
                    }
                }
            };
            reader.readAsText(file);
        });
    }

    if (composeForm) {
        composeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const content = document.getElementById('post-content').value;
            const basket = document.getElementById('post-basket').value;

            const post = {
                uid: currentUser.uid,
                email: currentUser.email,
                content,
                basket,
                winRate: userMetrics.winRate,
                roi: userMetrics.roi,
                likes: [],
                createdAt: Date.now()
            };

            try {
                const submitBtn = composeForm.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Paylaşılıyor...';

                await addDoc(collection(db, "posts"), post);
                composeForm.reset();

                submitBtn.disabled = false;
                submitBtn.textContent = 'Paylaş';
            } catch (error) {
                console.error("Error creating post", error);
                alert("Paylaşılamadı.");
            }
        });
    }

    const viewProfile = document.getElementById('view-profile');
    const profileFeedList = document.getElementById('profile-feed-list');
    const btnBackToFeed = document.getElementById('btn-back-to-feed');

    let currentProfileUnsubscribe = null;
    function openProfileView(uid, username, winrate, roi, email) {
        if (!currentUser) return;
        if (discoverPage) discoverPage.classList.add('hidden');
        if (portfolioPage) portfolioPage.classList.add('hidden');
        if (viewProfile) viewProfile.classList.remove('hidden');
        if (fabAdd) fabAdd.classList.add('hidden');

        document.getElementById('profile-view-avatar').textContent = email ? email[0].toUpperCase() : 'U';
        document.getElementById('profile-view-username').textContent = `@${username}`;
        document.getElementById('profile-view-winrate').textContent = winrate !== 'N/A' ? `%${winrate} Başarı` : 'Yeni Yatırımcı';
        document.getElementById('profile-view-roi').textContent = roi !== 'N/A' ? (parseFloat(roi) > 0 ? '+' : '') + roi + '%' : 'N/A';

        if (currentProfileUnsubscribe) currentProfileUnsubscribe();

        const q = query(collection(db, "posts"), where("uid", "==", uid), orderBy("createdAt", "desc"));
        currentProfileUnsubscribe = onSnapshot(q, (snapshot) => {
            if (!profileFeedList) return;
            profileFeedList.innerHTML = '';
            snapshot.forEach((docSnap) => {
                profileFeedList.appendChild(createPostCard(docSnap.data(), docSnap.id, true));
            });
        });
    }

    function createPostCard(post, postId, isProfileView = false) {
        const card = document.createElement('div');
        card.className = 'post-card';

        const avatarLetter = post.email ? post.email[0].toUpperCase() : 'U';
        const username = post.email ? post.email.split('@')[0] : 'user';
        const winRateText = post.winRate !== 'N/A' ? `%${post.winRate} Başarı` : 'Yeni Yatırımcı';
        const roiText = post.roi !== 'N/A' ? (parseFloat(post.roi) > 0 ? '+' : '') + post.roi + '%' : 'N/A';
        const profitClass = post.roi !== 'N/A' && parseFloat(post.roi) < 0 ? 'color: var(--danger-color);' : '';

        const likesArray = post.likes || [];
        const isLiked = currentUser ? likesArray.includes(currentUser.uid) : false;
        const likeCount = likesArray.length;

        const isOwner = currentUser && post.uid === currentUser.uid;

        card.innerHTML = `
            <div class="post-header">
                <div class="post-user-info ${isProfileView ? '' : 'clickable-user'}" data-uid="${post.uid}" data-username="${username}" data-winrate="${post.winRate}" data-roi="${post.roi}" data-email="${post.email}">
                    <div class="avatar">${avatarLetter}</div>
                    <div class="user-meta">
                        <span class="username">@${username}</span>
                        <span class="post-time">${new Date(post.createdAt).toLocaleString()}</span>
                    </div>
                </div>
                <div class="trust-badge">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    <span>${winRateText}</span>
                </div>
            </div>
            <div class="post-body">
                <p>${post.content}</p>
            </div>
            <div class="portfolio-attachment">
                <div class="attachment-header">
                    <span class="attachment-title">Paylaşılan Sepet: ${post.basket}</span>
                    <span class="attachment-profit" style="${profitClass}">${roiText}</span>
                </div>
            </div>
            <div class="post-actions">
                <button class="btn-like ${isLiked ? 'liked' : ''}" data-id="${postId}">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="${isLiked ? 'currentColor' : 'none'}"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    <span>${likeCount} Beğen</span>
                </button>
                ${isOwner ? `<button class="btn-delete-post" data-id="${postId}">Sil</button>` : ''}
            </div>
        `;

        if (!isProfileView) {
            const userEl = card.querySelector('.clickable-user');
            if (userEl) {
                userEl.addEventListener('click', (e) => {
                    const ds = e.currentTarget.dataset;
                    openProfileView(ds.uid, ds.username, ds.winrate, ds.roi, ds.email);
                });
            }
        }

        card.querySelector('.btn-like').addEventListener('click', async (e) => {
            if (!currentUser) return;
            const pid = e.currentTarget.dataset.id;
            const postRef = doc(db, "posts", pid);
            const isCurrentlyLiked = e.currentTarget.classList.contains('liked');
            try {
                if (isCurrentlyLiked) {
                    await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
                } else {
                    await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
                }
            } catch (err) { console.error(err); }
        });

        const deleteBtn = card.querySelector('.btn-delete-post');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                if (confirm("Bu gönderiyi silmek istediğinize emin misiniz?")) {
                    const pid = e.currentTarget.dataset.id;
                    try {
                        await deleteDoc(doc(db, "posts", pid));
                    } catch (err) { console.error(err); }
                }
            });
        }

        return card;
    }

    let currentFeedUnsubscribe = null;
    function loadSocialFeed() {
        if (!feedList || !currentUser) return;
        if (currentFeedUnsubscribe) currentFeedUnsubscribe();

        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        currentFeedUnsubscribe = onSnapshot(q, (snapshot) => {
            feedList.innerHTML = '';
            snapshot.forEach((docSnap) => {
                feedList.appendChild(createPostCard(docSnap.data(), docSnap.id, false));
            });
        });
    }

    let portfolioFeedUnsubscribe = null;
    function loadPortfolioFeed() {
        const portfolioFeedList = document.getElementById('portfolio-feed-list');
        if (!portfolioFeedList || !currentUser) return;
        if (portfolioFeedUnsubscribe) portfolioFeedUnsubscribe();

        const q = query(collection(db, "posts"), where("uid", "==", currentUser.uid), orderBy("createdAt", "desc"));
        portfolioFeedUnsubscribe = onSnapshot(q, (snapshot) => {
            portfolioFeedList.innerHTML = '<h3 style="margin-bottom: 1.5rem; color: var(--text-primary); font-size: 1.25rem;">Geçmiş Gönderileriniz</h3>';
            if (snapshot.empty) {
                portfolioFeedList.innerHTML += '<div class="empty-state">Henüz gönderiniz yok. Keşfet sekmesinden bir şeyler paylaşın!</div>';
                return;
            }
            snapshot.forEach((docSnap) => {
                portfolioFeedList.appendChild(createPostCard(docSnap.data(), docSnap.id, true));
            });
        });
    }

    if (btnBackToFeed) {
        btnBackToFeed.addEventListener('click', () => {
            if (viewProfile) viewProfile.classList.add('hidden');
            if (discoverPage) discoverPage.classList.remove('hidden');
        });
    }

    const btnPort = document.getElementById('btn-tab-portfolio');
    const btnDisc = document.getElementById('btn-tab-discover');
    const pagePort = document.getElementById('portfolio-page');
    const pageDisc = document.getElementById('discover-page');

    if (btnPort && btnDisc && pagePort && pageDisc) {
        btnPort.addEventListener('click', () => {
            pagePort.classList.remove('hidden');
            pageDisc.classList.add('hidden');
            btnPort.classList.add('active');
            btnDisc.classList.remove('active');
            if (viewProfile) viewProfile.classList.add('hidden');
            if (fabAdd) fabAdd.classList.remove('hidden');
        });

        btnDisc.addEventListener('click', () => {
            pageDisc.classList.remove('hidden');
            pagePort.classList.add('hidden');
            btnDisc.classList.add('active');
            btnPort.classList.remove('active');
            if (viewProfile) viewProfile.classList.add('hidden');
            if (fabAdd) fabAdd.classList.add('hidden');
        });
    }
});

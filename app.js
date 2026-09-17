const { createApp } = Vue

createApp({
    data() {
        return {
            masterRanks: [],
            serverDailyData: [],
            userInputs: [],
            editingCell: null,
            isLoaded: false
        }
    },
    computed: {
        calculatedDailyData() {
            if (!this.isLoaded) return [];

            let cumulativePower = 0;
            let results = [];

            // 現在入力されている最も新しい日（現在地）を特定
            let latestActiveIndex = -1;
            for (let i = this.serverDailyData.length - 1; i >= 0; i--) {
                const uIn = this.userInputs[i];
                if (uIn && uIn.jibunPower !== null && uIn.jibunPower !== '' && !isNaN(uIn.jibunPower)) {
                    latestActiveIndex = i;
                    break;
                }
            }

            for (let i = 0; i < this.serverDailyData.length; i++) {
                const serverDay = this.serverDailyData[i];
                const userIn = this.userInputs[i] || { minnaPower: null, jibunPower: null };
                
                let mPower = (userIn.minnaPower !== null && userIn.minnaPower !== '' && !isNaN(userIn.minnaPower)) ? Number(userIn.minnaPower) : 0;
                
                // じぶんのパワーは、ベース値（入力値）に倍率（トグル）を乗算して計算する
                let jPowerBase = (userIn.jibunPower !== null && userIn.jibunPower !== '' && !isNaN(userIn.jibunPower)) ? Number(userIn.jibunPower) : 0;
                let jMultiplier = userIn.jibunMultiplier || 1;
                let jPower = jPowerBase * jMultiplier;

                let minna = serverDay.isFixed ? serverDay.fixedMinnaPower : mPower;
                let jibun = jPower;
                
                let dayEventPower = minna + jibun;
                cumulativePower += dayEventPower;

                let reachedRank = 1;
                for (let r = this.masterRanks.length - 1; r >= 0; r--) {
                    if (cumulativePower >= this.masterRanks[r].requiredPower) {
                        reachedRank = this.masterRanks[r].rank;
                        break;
                    }
                }

                results.push({
                    date: serverDay.date,
                    day: serverDay.day,
                    isFixed: serverDay.isFixed,
                    minnaPower: minna,
                    jibunPower: jPowerBase, // 画面表示等でベース値を参照できるよう維持
                    hasJibunInput: (userIn.jibunPower !== null && userIn.jibunPower !== '' && !isNaN(userIn.jibunPower)), 
                    eventPower: cumulativePower,
                    reachedRank: reachedRank,
                    isLatestActive: i === latestActiveIndex // 強調表示用のフラグ
                });
            }
            return results;
        },
        latestValidData() {
            if (this.calculatedDailyData.length === 0) return null;
            for (let i = this.calculatedDailyData.length - 1; i >= 0; i--) {
                if (this.calculatedDailyData[i].hasJibunInput) {
                    return this.calculatedDailyData[i];
                }
            }
            return { eventPower: 0, reachedRank: 1 };
        },
        totalEventPower() {
            const data = this.latestValidData;
            return data ? data.eventPower : 0;
        },
        currentRank() {
            const data = this.latestValidData;
            return { rank: data ? data.reachedRank : 1 };
        },
        nextRank() {
            const currentRankNum = this.currentRank.rank;
            return this.masterRanks.find(r => r.rank === currentRankNum + 1) || null;
        },
        progressPercentage() {
            if (!this.nextRank) return 100;
            const currentRankDef = this.masterRanks.find(r => r.rank === this.currentRank.rank);
            const basePower = currentRankDef ? currentRankDef.requiredPower : 0;
            
            const powerNeededForNext = this.nextRank.requiredPower - basePower;
            const currentProgress = this.totalEventPower - basePower;
            
            let percent = (currentProgress / powerNeededForNext) * 100;
            return Math.min(Math.max(percent, 0), 100);
        }
    },
    methods: {
        initializeUserInputs() {
            this.userInputs = this.serverDailyData.map(day => ({
                minnaPower: day.isFixed ? null : day.fixedMinnaPower,
                jibunPower: null,
                minnaDirty: false,
                jibunDirty: false,
                jibunLocked: false,
                jibunMultiplier: 1 // 倍率の初期値（等倍）
            }));
        },
        async loadData() {
            try {
                const response = await fetch(`data.json?t=${new Date().getTime()}`);
                const data = await response.json();
                this.masterRanks = data.masterRanks;
                this.serverDailyData = data.dailyData;

                const saved = localStorage.getItem('mewtwo_sleep_calc_data');
                if (saved) {
                    const parsedSaved = JSON.parse(saved);
                    if(parsedSaved.length === this.serverDailyData.length){
                         this.userInputs = parsedSaved.map(item => ({
                             minnaPower: item.minnaPower,
                             jibunPower: item.jibunPower,
                             minnaDirty: false,
                             jibunDirty: false,
                             jibunLocked: item.jibunLocked || false,
                             jibunMultiplier: item.jibunMultiplier || 1 // 過去の倍率状態を復元
                         }));
                    } else {
                         this.initializeUserInputs();
                    }
                } else {
                    this.initializeUserInputs();
                }
                
                this.isLoaded = true;
            } catch (error) {
                console.error("データの読み込みに失敗しました:", error);
                alert("データの読み込みに失敗しました。時間をおいて再読み込みしてください。");
            }
        },
        startEdit(index, type) {
            if (type === 'jibun' && this.userInputs[index] && this.userInputs[index].jibunLocked) return;

            this.editingCell = { index, type };
            this.$nextTick(() => {
                const el = document.getElementById(`input-${type}-${index}`);
                if (el) {
                    el.focus();
                    el.select();
                }
            });
        },
        // ロック・アンロックを切り替えるメソッド
        toggleLock(index) {
            if (this.userInputs[index]) {
                this.userInputs[index].jibunLocked = !this.userInputs[index].jibunLocked;
                
                if (this.userInputs[index].jibunLocked) {
                    this.userInputs[index].jibunDirty = false;
                    if (this.editingCell && this.editingCell.index === index && this.editingCell.type === 'jibun') {
                        this.editingCell = null;
                    }
                }
                localStorage.setItem('mewtwo_sleep_calc_data', JSON.stringify(this.userInputs));
            }
        },
        // トグル式：倍率ボタンを押した時の処理
        toggleMultiplier(index, value) {
            if (this.userInputs[index] && this.userInputs[index].jibunLocked) return;
            
            // 既に同じ倍率が適用されている場合は 1（等倍）に戻す
            if (this.userInputs[index].jibunMultiplier === value) {
                this.userInputs[index].jibunMultiplier = 1;
            } else {
                this.userInputs[index].jibunMultiplier = value;
            }
            
            // 保存ボタンを表示させる
            this.userInputs[index].jibunDirty = true;
        },
        handleBlur() {
            setTimeout(() => {
                this.editingCell = null;
            }, 150);
        },
        blurAndSave(index, type) {
            this.saveOne(index, type);
            this.editingCell = null;
        },
        saveOne(index, type) {
            if (type === 'minna') {
                this.userInputs[index].minnaDirty = false;
            } else {
                this.userInputs[index].jibunDirty = false;
            }
            localStorage.setItem('mewtwo_sleep_calc_data', JSON.stringify(this.userInputs));
            this.editingCell = null;
        },
        getRankColorClass(rank) {
            if (rank <= 5) return 'text-rank-low';
            if (rank <= 10) return 'text-rank-mid';
            return 'text-rank-high';
        },
        getRankBgClass(rank) {
            if (rank <= 5) return 'bg-rank-low';
            if (rank <= 10) return 'bg-rank-mid';
            return 'bg-rank-high';
        },
        getProgressBarColor(nextRank) {
            if (nextRank <= 5) return '#3b82f6';
            if (nextRank <= 10) return '#a855f7';
            return '#ec4899';
        }
    },
    mounted() {
        this.loadData();
    }
}).mount('#app')
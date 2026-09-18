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
            
            // 画面上部に反映されている「現在地（最新のじぶん入力日）」を特定する
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
                let jPower = (userIn.jibunPower !== null && userIn.jibunPower !== '' && !isNaN(userIn.jibunPower)) ? Number(userIn.jibunPower) : 0;

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
                    jibunPower: jibun,
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
                lastServerMinnaPower: day.fixedMinnaPower // サーバーの値を記憶
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
                         this.userInputs = parsedSaved.map((item, index) => {
                             const serverDay = this.serverDailyData[index];
                             
                             let currentMinnaPower = item.minnaPower;
                             let newLastServerMinnaPower = item.lastServerMinnaPower;
                             
                             // ▼【重要】data.jsonが更新されたか判定し、更新されていれば既存データを上書きする
                             if (item.lastServerMinnaPower !== serverDay.fixedMinnaPower) {
                                 currentMinnaPower = serverDay.isFixed ? null : serverDay.fixedMinnaPower;
                                 newLastServerMinnaPower = serverDay.fixedMinnaPower;
                             }

                             return {
                                 minnaPower: currentMinnaPower,
                                 jibunPower: item.jibunPower,
                                 minnaDirty: false,
                                 jibunDirty: false,
                                 jibunLocked: item.jibunLocked || false,
                                 lastServerMinnaPower: newLastServerMinnaPower // 更新判定用の記録を維持
                             };
                         });
                         
                         // データの追従（上書き）があった場合に備えて、即座にストレージに最新状態を保存
                         localStorage.setItem('mewtwo_sleep_calc_data', JSON.stringify(this.userInputs));
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
            // ロックされている場合は編集モードに移行しない
            if (type === 'jibun' && this.userInputs[index].jibunLocked) return;
            
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
                
                // ロックした瞬間に変更フラグや編集状態もクリアする
                if (this.userInputs[index].jibunLocked) {
                    this.userInputs[index].jibunDirty = false;
                    if (this.editingCell && this.editingCell.index === index && this.editingCell.type === 'jibun') {
                        this.editingCell = null;
                    }
                }
                // 状態をローカルストレージへ即時保存
                localStorage.setItem('mewtwo_sleep_calc_data', JSON.stringify(this.userInputs));
            }
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
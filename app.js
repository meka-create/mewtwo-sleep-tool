const { createApp } = Vue

createApp({
    data() {
        return {
            masterRanks: [],
            serverDailyData: [],
            userInputs: [],
            savedUserInputs: [],
            editingCell: null,
            isLoaded: false
        }
    },
    computed: {
        calculatedDailyData() {
            if (!this.isLoaded) return [];

            let cumulativePower = 0;
            let results = [];

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
                    reachedRank: reachedRank
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
                jibunPower: null
            }));
        },
        async loadData() {
            try {
                // キャッシュ回避のためクエリパラメータを付与
                const response = await fetch(`data.json?t=${new Date().getTime()}`);
                const data = await response.json();
                this.masterRanks = data.masterRanks;
                this.serverDailyData = data.dailyData;

                const saved = localStorage.getItem('mewtwo_sleep_calc_data');
                if (saved) {
                    const parsedSaved = JSON.parse(saved);
                    if(parsedSaved.length === this.serverDailyData.length){
                         this.userInputs = parsedSaved;
                    } else {
                         this.initializeUserInputs();
                    }
                } else {
                    this.initializeUserInputs();
                }
                
                // 初回読み込み完了時に、現在の状態を厳密に保存（クローン）する
                this.syncSavedData();
                this.isLoaded = true;
            } catch (error) {
                console.error("データの読み込みに失敗しました:", error);
                alert("データの読み込みに失敗しました。時間をおいて再読み込みしてください。");
            }
        },
        syncSavedData() {
            // Vueのプロキシや参照を切り離し、純粋な値としてクローンを保存
            this.savedUserInputs = JSON.parse(JSON.stringify(this.userInputs));
        },
        startEdit(index, type) {
            this.editingCell = { index, type };
            this.$nextTick(() => {
                const el = document.getElementById(`input-${type}-${index}`);
                if (el) {
                    el.focus();
                    el.select(); // タップ時に即座に上書きできるよう全選択
                }
            });
        },
        handleBlur() {
            setTimeout(() => {
                this.editingCell = null;
            }, 150);
        },
        blurAndSave() {
            this.saveAll();
            this.editingCell = null;
        },
        // 「保存された値」と「現在の入力」を数値レベルで厳密に比較する
        isModified(index, type) {
            if (!this.savedUserInputs || this.savedUserInputs.length <= index) return false;
            
            let current = this.userInputs[index][type];
            let saved = this.savedUserInputs[index][type];
            
            // 空欄（null, undefined, 空文字）の判定
            let isCurrentEmpty = (current === null || current === undefined || current === '');
            let isSavedEmpty = (saved === null || saved === undefined || saved === '');
            
            // 両方とも空欄なら変更なし
            if (isCurrentEmpty && isSavedEmpty) return false;
            // どちらか一方だけが空欄になった場合は変更あり
            if (isCurrentEmpty !== isSavedEmpty) return true;
            
            // どちらも数値が存在する場合は、数値型にして比較（"263.0" と 263 などの誤判定を防止）
            return Number(current) !== Number(saved);
        },
        saveAll() {
            localStorage.setItem('mewtwo_sleep_calc_data', JSON.stringify(this.userInputs));
            // 保存完了後、新しい基準状態として同期する
            this.syncSavedData();
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
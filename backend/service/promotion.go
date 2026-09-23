package service

import (
	"time"

	. "ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/utils"
)

// StartCommissionSettlementTask 定时结算达到配置天数的推广佣金。
// 结算任务只更新佣金状态，不参与文章购买和余额扣款事务。
func StartCommissionSettlementTask() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	settlePendingCommissions()
	for range ticker.C {
		settlePendingCommissions()
	}
}

// settlePendingCommissions 将超过结算期限的待结算佣金标记为已结算。
func settlePendingCommissions() {
	config, err := model.GetOrCreatePromotionConfig(Db)
	if err != nil {
		global.Log.Errorf("获取推广佣金结算配置失败: %v", err)
		return
	}
	if !config.Status {
		return
	}

	query := Db.Model(&model.Commission{}).Where("status = ?", 0)
	updates := map[string]interface{}{
		"status":      1,
		"settle_time": utils.HTime{Time: utils.Now()},
	}
	if config.CommissionSettleDays > 0 {
		deadline := utils.Now().AddDate(0, 0, -config.CommissionSettleDays)
		query = query.Where("create_time <= ?", deadline)
	}
	if err := query.Updates(updates).Error; err != nil {
		global.Log.Errorf("结算推广佣金失败: %v", err)
	}
}

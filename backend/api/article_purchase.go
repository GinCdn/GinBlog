package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"ginblog/config"
	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var errArticleAlreadyUnlocked = errors.New("文章已经解锁")

const (
	articleCommentAccessCookiePrefix = "ginblog_article_comment_access_"
	articleCommentAccessMaxAge       = 30 * 24 * 60 * 60
)

// articleCommentAccessCookieName 返回指定文章的评论解锁凭证名称。
func articleCommentAccessCookieName(articleID uint) string {
	return fmt.Sprintf("%s%d", articleCommentAccessCookiePrefix, articleID)
}

// articleCommentAccessSignature 使用用户令牌密钥签名评论解锁凭证，避免客户端伪造解锁状态。
func articleCommentAccessSignature(payload string) []byte {
	h := hmac.New(sha256.New, []byte(config.AppConfig.Token.UserToken.Secret))
	_, _ = h.Write([]byte(payload))
	return h.Sum(nil)
}

// createArticleCommentAccessToken 创建带有效期的文章评论解锁凭证。
func createArticleCommentAccessToken(articleID uint) string {
	expiresAt := utils.Now().AddDate(0, 0, 30).Unix()
	payload := fmt.Sprintf("%d.%d", articleID, expiresAt)
	encodedPayload := base64.RawURLEncoding.EncodeToString([]byte(payload))
	encodedSignature := base64.RawURLEncoding.EncodeToString(articleCommentAccessSignature(payload))
	return encodedPayload + "." + encodedSignature
}

// hasArticleCommentAccess 校验当前浏览器是否持有指定文章的有效评论解锁凭证。
func hasArticleCommentAccess(c *gin.Context, articleID uint) bool {
	token, err := c.Cookie(articleCommentAccessCookieName(articleID))
	if err != nil || token == "" {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, articleCommentAccessSignature(string(payloadBytes))) {
		return false
	}
	fields := strings.Split(string(payloadBytes), ".")
	if len(fields) != 2 {
		return false
	}
	storedArticleID, err := strconv.ParseUint(fields[0], 10, 64)
	if err != nil || storedArticleID != uint64(articleID) {
		return false
	}
	expiresAt, err := strconv.ParseInt(fields[1], 10, 64)
	return err == nil && utils.Now().Unix() <= expiresAt
}

// grantArticleCommentAccess 为游客评论成功后的当前浏览器写入解锁凭证。
func grantArticleCommentAccess(c *gin.Context, articleID uint) {
	c.SetCookie(articleCommentAccessCookieName(articleID), createArticleCommentAccessToken(articleID), articleCommentAccessMaxAge, "/", "", false, true)
}

// normalizeArticleAccessType 统一文章访问方式，历史文章和空值均按公开文章处理。
func normalizeArticleAccessType(accessType string) string {
	switch strings.ToLower(strings.TrimSpace(accessType)) {
	case "paid", "comment", "hidden":
		return strings.ToLower(strings.TrimSpace(accessType))
	default:
		return "public"
	}
}

// validateArticleAccess 校验整篇文章访问控制配置并返回规范化后的字段。
func validateArticleAccess(accessType string, price, rebateRate float64) (string, float64, float64, error) {
	return validateArticleAccessWithContent(accessType, price, rebateRate, "")
}

// validateArticleAccessWithContent 在兼容整篇访问方式的同时允许正文包含局部付费区块。
func validateArticleAccessWithContent(accessType string, price, rebateRate float64, content string) (string, float64, float64, error) {
	accessType = normalizeArticleAccessType(accessType)
	price = roundArticleMoney(price)
	rebateRate = math.Round(rebateRate*100) / 100
	if price < 0 || rebateRate < 0 || rebateRate > 100 {
		return "", 0, 0, errors.New("文章价格或返佣比例不合法")
	}
	hasLocalPaidContent := utils.HasArticlePaidContent(content)
	if (accessType == "paid" || hasLocalPaidContent) && price <= 0 {
		return "", 0, 0, errors.New("付费内容价格必须大于0")
	}
	if accessType != "paid" && !hasLocalPaidContent {
		price = 0
		rebateRate = 0
	}
	return accessType, price, rebateRate, nil
}

// roundArticleMoney 统一文章购买金额精度，避免浮点数造成余额扣款误差。
func roundArticleMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

// articleRoleDiscountRate 根据用户累计成功充值金额匹配当前生效的最高等级折扣。
func articleRoleDiscountRate(db *gorm.DB, userID uint) float64 {
	if userID == 0 {
		return 100
	}
	var totalRecharge float64
	db.Model(&model.RechargeOrder{}).
		Where("user_id = ? AND status = ?", userID, true).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalRecharge)

	var roles []model.RoleDiscount
	if db.Where("status = ?", true).Order("upgrade_recharge DESC, id DESC").Find(&roles).Error != nil {
		return 100
	}
	var defaultRate float64 = 100
	for _, role := range roles {
		if role.IsDefault {
			defaultRate = role.DiscountRate
		}
		if totalRecharge >= role.UpgradeRecharge {
			if role.DiscountRate < 0 {
				return 0
			}
			if role.DiscountRate > 100 {
				return 100
			}
			return role.DiscountRate
		}
	}
	if defaultRate < 0 {
		return 0
	}
	if defaultRate > 100 {
		return 100
	}
	return defaultRate
}

// articleViewerID 获取可选登录用户，不影响游客访问公开文章。
// articleRoleRebateRate 根据推广人的用户等级读取启用的返佣比例。
func articleRoleRebateRate(db *gorm.DB, inviterID uint) float64 {
	if inviterID == 0 {
		return 0
	}

	var inviter model.User
	if err := db.Select("id, status, role_level").First(&inviter, inviterID).Error; err != nil || inviter.Status != 1 {
		return 0
	}

	roleLevel := model.NormalizeRoleLevel(inviter.RoleLevel)
	var role model.RoleDiscount
	err := db.Where("role_level = ? AND status = ?", roleLevel, true).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) && roleLevel != model.DefaultRoleLevel {
		err = db.Where("role_level = ? AND status = ?", model.DefaultRoleLevel, true).First(&role).Error
	}
	if err != nil {
		return 0
	}
	if role.PackageRebate < 0 {
		return 0
	}
	if role.PackageRebate > 100 {
		return 100
	}
	return role.PackageRebate
}

func articleViewerID(c *gin.Context) uint {
	user, ok := currentUser(c)
	if !ok {
		return 0
	}
	return user.ID
}

// buildArticleAccess 根据用户身份计算文章是否解锁及需要支付的金额。
func buildArticleAccess(db *gorm.DB, article *model.Article, userID uint, guestCommentAccess bool) {
	originalContent := article.Content
	contentAccess := utils.AnalyzeArticleContent(originalContent)
	article.AccessType = normalizeArticleAccessType(article.AccessType)
	article.HasProtectedContent = contentAccess.HasProtected
	article.HasPaidContent = contentAccess.HasPaid
	article.HasCommentContent = contentAccess.HasComment
	article.PaidContentUnlocked = !contentAccess.HasPaid
	article.CommentContentUnlocked = !contentAccess.HasComment
	article.IsUnlocked = article.AccessType == "public"
	article.PayablePrice = roundArticleMoney(article.Price)
	article.DiscountRate = 100
	article.UnlockReason = ""
	// 局部付费区块也沿用文章价格和用户等级折扣规则。
	if (article.AccessType == "paid" || contentAccess.HasPaid) && article.RoleDiscount {
		article.DiscountRate = articleRoleDiscountRate(db, userID)
		article.PayablePrice = roundArticleMoney(article.Price * article.DiscountRate / 100)
	}
	isAuthor := userID > 0 && userID == article.AuthorID
	if isAuthor {
		article.IsUnlocked = true
		article.PaidContentUnlocked = true
		article.CommentContentUnlocked = true
	}

	if article.AccessType == "hidden" && !isAuthor {
		article.IsUnlocked = false
		article.UnlockReason = "作者暂未开放本文内容"
	}
	if article.AccessType == "paid" {
		if userID > 0 {
			var purchase model.ArticlePurchase
			if db.Where("article_id = ? AND user_id = ? AND status = ?", article.ID, userID, true).First(&purchase).Error == nil {
				article.IsUnlocked = true
			}
		}
		if article.IsUnlocked {
			article.PaidContentUnlocked = true
			article.CommentContentUnlocked = true
		} else {
			article.UnlockReason = "作者暂未开放本文内容"
		}
	}
	if article.AccessType == "comment" {
		if guestCommentAccess {
			article.IsUnlocked = true
		}
		if userID > 0 {
			var count int64
			db.Model(&model.Comment{}).Where("article_id = ? AND user_id = ? AND status <> ?", article.ID, userID, 3).Count(&count)
			if count > 0 {
				article.IsUnlocked = true
			}
		}
		if article.IsUnlocked {
			article.PaidContentUnlocked = true
			article.CommentContentUnlocked = true
		} else {
			article.UnlockReason = "发表评论后可阅读本文内容"
		}
	}

	// 公开文章的局部区块分别计算解锁状态，未解锁正文只保留公开内容和提示。
	if article.AccessType == "public" && !isAuthor {
		if contentAccess.HasPaid {
			if userID > 0 {
				var purchase model.ArticlePurchase
				article.PaidContentUnlocked = db.Where("article_id = ? AND user_id = ? AND status = ?", article.ID, userID, true).First(&purchase).Error == nil
			}
			if !article.PaidContentUnlocked {
				article.UnlockReason = "购买后可查看文章中的付费内容"
			}
		}
		if contentAccess.HasComment {
			article.CommentContentUnlocked = guestCommentAccess
			if userID > 0 {
				var count int64
				db.Model(&model.Comment{}).Where("article_id = ? AND user_id = ? AND status <> ?", article.ID, userID, 3).Count(&count)
				article.CommentContentUnlocked = count > 0
			}
			if !article.CommentContentUnlocked && article.UnlockReason == "" {
				article.UnlockReason = "发表评论后可查看文章中的评论内容"
			}
		}
	}

	if article.IsUnlocked {
		article.UnlockReason = ""
		article.Content = utils.RenderArticleContent(originalContent, article.PaidContentUnlocked, article.CommentContentUnlocked)
	} else {
		article.Content = ""
	}
}

// enrichArticleAccess 为公开文章列表裁剪受保护正文并附加解锁状态。
func enrichArticleAccess(db *gorm.DB, c *gin.Context, articles []model.Article) []model.Article {
	userID := articleViewerID(c)
	for index := range articles {
		buildArticleAccess(db, &articles[index], userID, hasArticleCommentAccess(c, articles[index].ID))
	}
	return articles
}

// GetArticleAccess 查询当前用户对指定文章的访问状态。
func GetArticleAccess(c *gin.Context) {
	articleID, err := strconv.ParseUint(c.Query("article_id"), 10, 64)
	if err != nil || articleID == 0 {
		result.FailedWithMsg(c, result.BadRequest, "文章ID不正确")
		return
	}
	var article model.Article
	if err := Db.Where("id = ? AND is_published = ?", articleID, true).First(&article).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "文章不存在或暂未公开")
		return
	}
	buildArticleAccess(Db, &article, articleViewerID(c), hasArticleCommentAccess(c, article.ID))
	article.Content = ""
	result.Success(c, gin.H{
		"article_id":               article.ID,
		"access_type":              article.AccessType,
		"price":                    article.Price,
		"role_discount":            article.RoleDiscount,
		"is_unlocked":              article.IsUnlocked,
		"payable_price":            article.PayablePrice,
		"discount_rate":            article.DiscountRate,
		"has_protected_content":    article.HasProtectedContent,
		"has_paid_content":         article.HasPaidContent,
		"has_comment_content":      article.HasCommentContent,
		"paid_content_unlocked":    article.PaidContentUnlocked,
		"comment_content_unlocked": article.CommentContentUnlocked,
		"unlock_reason":            article.UnlockReason,
	})
}

// PurchaseArticle 使用余额或在线支付解锁文章中的付费内容。
func PurchaseArticle(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.Unauthorized, "请先登录后购买文章")
		return
	}
	articleID, err := strconv.ParseUint(c.PostForm("article_id"), 10, 64)
	if err != nil || articleID == 0 {
		result.FailedWithMsg(c, result.BadRequest, "文章ID不正确")
		return
	}
	payWay := strings.ToLower(strings.TrimSpace(c.PostForm("pay_way")))
	if payWay == "" {
		payWay = "balance"
	}
	if payWay != "balance" && payWay != "alipay" && payWay != "wxpay" {
		result.FailedWithMsg(c, result.BadRequest, "支付方式不正确")
		return
	}
	var article model.Article
	if err := Db.Where("id = ? AND is_published = ?", articleID, true).First(&article).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "文章不存在或暂未公开")
		return
	}
	article.AccessType = normalizeArticleAccessType(article.AccessType)
	contentAccess := utils.AnalyzeArticleContent(article.Content)
	if article.AccessType != "paid" && !contentAccess.HasPaid {
		result.FailedWithMsg(c, result.BadRequest, "本文没有可购买的付费内容")
		return
	}
	if article.Price <= 0 {
		result.FailedWithMsg(c, result.BadRequest, "付费内容价格配置不正确")
		return
	}
	if article.AuthorID == user.ID {
		result.Success(c, gin.H{"article_id": article.ID, "is_unlocked": true, "amount": 0})
		return
	}

	// 同一篇文章保留一条待支付记录，重复点击时重新返回原订单的支付链接。
	var pendingPurchase model.ArticlePurchase
	if pendingErr := Db.Where("article_id = ? AND user_id = ?", article.ID, user.ID).First(&pendingPurchase).Error; pendingErr == nil {
		if pendingPurchase.Status {
			result.Success(c, gin.H{"article_id": article.ID, "is_unlocked": true, "amount": pendingPurchase.Amount, "trade_no": pendingPurchase.TradeNo})
			return
		}
		var pendingPayOrder model.PayOrder
		if err := Db.Where("trade_no = ? AND type = ?", pendingPurchase.TradeNo, "article").First(&pendingPayOrder).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "待支付订单数据异常")
			return
		}
		pendingConfig, configErr := loadEnabledEpayConfig(pendingPayOrder.PayType)
		if configErr != nil {
			result.FailedWithMsg(c, result.BadRequest, configErr.Error())
			return
		}
		payment, paymentErr := buildEpayPaymentInfo(pendingConfig, pendingPurchase.TradeNo, pendingPayOrder.PayType, "解锁文章："+article.Title, pendingPurchase.Amount)
		if paymentErr != nil {
			result.FailedWithMsg(c, result.BadRequest, paymentErr.Error())
			return
		}
		result.Success(c, gin.H{
			"article_id":     article.ID,
			"is_unlocked":    false,
			"amount":         pendingPurchase.Amount,
			"original_price": pendingPurchase.OriginalPrice,
			"discount_rate":  pendingPurchase.DiscountRate,
			"trade_no":       pendingPurchase.TradeNo,
			"pay_way":        pendingPayOrder.PayType,
			"pay_info":       payment,
		})
		return
	} else if !errors.Is(pendingErr, gorm.ErrRecordNotFound) {
		result.FailedWithMsg(c, result.InternalError, "查询文章购买订单失败")
		return
	}

	discountRate := float64(100)
	if article.RoleDiscount {
		discountRate = articleRoleDiscountRate(Db, user.ID)
	}
	amount := roundArticleMoney(article.Price * discountRate / 100)
	tradeNo := generateTradeNo()
	var payment paymentInfo
	if payWay != "balance" {
		paymentConfig, configErr := loadEnabledEpayConfig(payWay)
		if configErr != nil {
			result.FailedWithMsg(c, result.BadRequest, configErr.Error())
			return
		}
		payment, err = buildEpayPaymentInfo(paymentConfig, tradeNo, payWay, "解锁文章："+article.Title, amount)
		if err != nil {
			result.FailedWithMsg(c, result.BadRequest, err.Error())
			return
		}
	}
	now := utils.HTime{Time: utils.Now()}
	purchase := model.ArticlePurchase{}
	err = Db.Transaction(func(tx *gorm.DB) error {
		var existing model.ArticlePurchase
		findErr := tx.Where("article_id = ? AND user_id = ?", article.ID, user.ID).First(&existing).Error
		if findErr == nil {
			purchase = existing
			if existing.Status {
				return errArticleAlreadyUnlocked
			}
			return errors.New("存在待支付订单，请先完成支付后再试")
		}
		if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return findErr
		}

		if payWay == "balance" {
			var lockedUser model.User
			if findErr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedUser, user.ID).Error; findErr != nil {
				return findErr
			}
			if lockedUser.Money < amount {
				return errors.New("余额不足，请先充值")
			}
			lockedUser.Money = roundArticleMoney(lockedUser.Money - amount)
			if err := tx.Model(&model.User{}).Where("id = ?", lockedUser.ID).Update("money", lockedUser.Money).Error; err != nil {
				return err
			}
			payTime := now
			purchase = model.ArticlePurchase{
				ArticleID:     article.ID,
				UserID:        user.ID,
				TradeNo:       tradeNo,
				Amount:        amount,
				OriginalPrice: roundArticleMoney(article.Price),
				DiscountRate:  discountRate,
				Status:        true,
				CreateTime:    now,
				PayTime:       &payTime,
			}
			if err := tx.Create(&purchase).Error; err != nil {
				return err
			}
			payOrder := model.PayOrder{
				TradeNo:    tradeNo,
				Type:       "article",
				Name:       article.Title,
				Money:      amount,
				Username:   lockedUser.Username,
				Status:     true,
				PayType:    "balance",
				CreateTime: now,
				PayTime:    &payTime,
			}
			if err := tx.Create(&payOrder).Error; err != nil {
				return err
			}

			promotionConfig, configErr := model.GetOrCreatePromotionConfig(tx)
			if configErr != nil {
				return configErr
			}
			// 付费文章返佣比例始终由推广人的用户等级自动决定。
			if promotionConfig.Status && amount > 0 {
				var relation model.InviteRelation
				if relationErr := tx.Where("invitee_id = ? AND inviter_id <> ?", user.ID, user.ID).First(&relation).Error; relationErr == nil {
					rebateRate := articleRoleRebateRate(tx, relation.InviterID)
					commissionAmount := roundArticleMoney(amount * rebateRate / 100)
					if rebateRate > 0 && commissionAmount > 0 {
						commissionStatus := 0
						var settleTime *utils.HTime
						if promotionConfig.CommissionSettleDays <= 0 {
							commissionStatus = 1
							settledAt := now
							settleTime = &settledAt
						}
						commission := model.Commission{
							InviterID:   relation.InviterID,
							InviterName: relation.InviterName,
							InviteeID:   user.ID,
							InviteeName: lockedUser.Username,
							OrderNo:     tradeNo,
							OrderAmount: amount,
							RebateRate:  rebateRate,
							Amount:      commissionAmount,
							Status:      commissionStatus,
							SettleTime:  settleTime,
							CreateTime:  now,
						}
						if err := tx.Create(&commission).Error; err != nil {
							return err
						}
					}
				}
			}
			return nil
		}

		purchase = model.ArticlePurchase{
			ArticleID:     article.ID,
			UserID:        user.ID,
			TradeNo:       tradeNo,
			Amount:        amount,
			OriginalPrice: roundArticleMoney(article.Price),
			DiscountRate:  discountRate,
			Status:        false,
			CreateTime:    now,
		}
		if err := tx.Create(&purchase).Error; err != nil {
			return err
		}
		// 旧表结构曾将状态默认值设为已解锁，创建在线待支付订单后显式覆盖为未解锁。
		if err := tx.Model(&model.ArticlePurchase{}).Where("id = ?", purchase.ID).Update("status", false).Error; err != nil {
			return err
		}
		purchase.Status = false
		payOrder := model.PayOrder{
			TradeNo:    tradeNo,
			Type:       "article",
			Name:       article.Title,
			Money:      amount,
			Username:   user.Username,
			Status:     false,
			PayType:    payWay,
			CreateTime: now,
		}
		return tx.Create(&payOrder).Error
	})
	if errors.Is(err, errArticleAlreadyUnlocked) {
		result.Success(c, gin.H{"article_id": article.ID, "is_unlocked": true, "amount": purchase.Amount, "trade_no": purchase.TradeNo})
		return
	}
	if err != nil {
		if strings.Contains(err.Error(), "余额不足") || strings.Contains(err.Error(), "待支付") {
			result.FailedWithMsg(c, result.BadRequest, err.Error())
			return
		}
		result.FailedWithMsg(c, result.InternalError, fmt.Sprintf("购买文章失败：%v", err))
		return
	}
	if payWay != "balance" {
		result.Success(c, gin.H{
			"article_id":     article.ID,
			"is_unlocked":    false,
			"amount":         purchase.Amount,
			"original_price": purchase.OriginalPrice,
			"discount_rate":  purchase.DiscountRate,
			"trade_no":       purchase.TradeNo,
			"pay_way":        payWay,
			"pay_info":       payment,
		})
		return
	}
	result.Success(c, gin.H{
		"article_id":     article.ID,
		"is_unlocked":    true,
		"amount":         purchase.Amount,
		"original_price": purchase.OriginalPrice,
		"discount_rate":  purchase.DiscountRate,
		"trade_no":       purchase.TradeNo,
	})
}

package controller

import "ginblog/model"

// MakeCategoryTree 把扁平的分类列表转成树形结构
func MakeCategoryTree(allCategories []model.Category) []model.CategoryTree {
	// 1. 先把所有分类转成 CategoryTree 类型（方便加Children）
	var treeNodes []model.CategoryTree
	for _, c := range allCategories {
		treeNodes = append(treeNodes, model.CategoryTree{
			Cid:         c.Cid,
			Name:        c.Name,
			Slug:        c.Slug,
			ParentID:    c.ParentID,
			Count:       c.Count,
			Description: c.Description,
			Children:    []model.CategoryTree{}, // 先初始化空的子分类列表
		})
	}

	// 2. 遍历所有节点，给每个父节点找子节点
	var result []model.CategoryTree
	for _, node := range treeNodes {
		if node.ParentID == 0 { // 顶级分类（parent_id=0）
			// 给当前顶级分类找子分类
			node.Children = findChildren(node.Cid, treeNodes)
			result = append(result, node)
		}
	}
	return result
}

// findChildren 辅助函数：找某个父分类的所有子分类
func findChildren(parentID uint, allNodes []model.CategoryTree) []model.CategoryTree {
	var children []model.CategoryTree
	for _, node := range allNodes {
		if node.ParentID == int(parentID) { // 子分类的parent_id等于父分类的cid
			// 递归：给子分类找它的子分类（支持多级分类）
			node.Children = findChildren(node.Cid, allNodes)
			children = append(children, node)
		}
	}
	return children
}

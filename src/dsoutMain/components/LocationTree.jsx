import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useBase } from '../../context/BaseContext'; // dsTask 가져오기

const LocationTree = ({ dsTask, initialState, onStateChange }) => {
  // 상태 변수 정의: 트리 구조, 노드 체크 상태, 현재 위치 상태, 트리 확장 상태
  const [nodes, setNodes] = useState([]);
  const [nodeCheckStates, setNodeCheckStates] = useState({});
  const [currentLocations, setCurrentLocations] = useState(initialState);
  const [expandedArea, setExpandedArea] = useState(null); // 현재 확장된 Area

  // dsTask 데이터가 변경될 때 트리 데이터를 생성하고 초기 체크 상태를 설정하는 useEffect
  useEffect(() => {
    if (!dsTask) return;
    const generatedNodes = generateTreeData(dsTask);
    setNodes(generatedNodes);
    initializeCheckStates(generatedNodes, initialState);
  }, [dsTask, initialState]);

  // 트리 노드의 체크 상태를 초기화하는 함수
  const initializeCheckStates = (nodes, initialState) => {
    const checkStates = {};

    // 재귀적으로 노드를 순회하며 체크 상태를 설정
    const initialize = (nodeList) => {
      nodeList.forEach((node) => {
        if (node.children && node.children.length > 0) {
          initialize(node.children);
          // 모든 자식 노드가 선택된 경우 부모 노드를 체크
          const allChildrenChecked = node.children.every((child) => checkStates[child.key] === true);
          // 일부 자식 노드만 선택된 경우 부모 노드를 부분 체크 상태로 설정
          const anyChildChecked = node.children.some(
            (child) => checkStates[child.key] === true || checkStates[child.key] === null
          );
          checkStates[node.key] = allChildrenChecked ? true : anyChildChecked ? null : false;
        } else {
          // 초기 상태에 포함된 키는 체크 상태로 설정
          checkStates[node.key] = initialState.includes(node.key);
        }
      });
    };

    initialize(nodes);
    setNodeCheckStates(checkStates);
  };

  // dsTask 데이터를 기반으로 트리 구조 데이터를 생성하는 함수
  const generateTreeData = (taskList) => {
    if (!taskList.area || !taskList.courseNames) return [];

    // 코스에 포함된 홀 번호를 생성
    const holes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return taskList.area.map((area) => ({
      key: area,
      label: `${area}`,
      children: taskList.courseNames.map((course) => ({
        key: `${area}/${course}`,
        label: `${course}`,
        children: holes.map((hole) => ({
          key: `${area}/${course}/${hole}`,
          label: `${hole}`,
        })),
      })),
    }));
  };

  // 특정 Area 버튼을 클릭하여 해당 Area의 확장 상태를 토글하는 함수
  const handleAreaToggle = (areaKey) => {
    setExpandedArea((prev) => (prev === areaKey ? null : areaKey));
  };

  // 특정 노드의 체크 상태를 변경하는 함수
  const handleCheckChange = (key, value) => {
    const updatedCheckStates = { ...nodeCheckStates, [key]: value };
    // 자식 노드의 상태 업데이트
    updateChildCheckStates(findNodeByKey(nodes, key), value, updatedCheckStates);
    // 부모 노드의 상태 업데이트
    updateParentCheckStates(key, updatedCheckStates);
    setNodeCheckStates(updatedCheckStates);
    const checkedKeys = getCheckedKeys(updatedCheckStates);
    onStateChange(checkedKeys);

  };

  // 선택 상태 변경 시 자식 노드들의 상태를 재귀적으로 업데이트하는 함수
  const updateChildCheckStates = (node, isChecked, checkStates) => {
    if (node && node.children) {
      node.children.forEach((child) => {
        checkStates[child.key] = isChecked;
        updateChildCheckStates(child, isChecked, checkStates);
      });
    }
  };

  // 선택 상태 변경 시 부모 노드들의 상태를 재귀적으로 업데이트하는 함수
  const updateParentCheckStates = (key, checkStates) => {
    const parentKey = key.includes('/') ? key.substring(0, key.lastIndexOf('/')) : null;
    if (parentKey) {
      const parentNode = findNodeByKey(nodes, parentKey);
      if (parentNode) {
        const allChildrenChecked = parentNode.children.every((child) => checkStates[child.key] === true);
        const anyChildChecked = parentNode.children.some((child) => checkStates[child.key] === true || checkStates[child.key] === null);
        checkStates[parentKey] = allChildrenChecked ? true : anyChildChecked ? null : false;
        updateParentCheckStates(parentKey, checkStates);
      }
    }
  };

  // 트리에서 특정 키에 해당하는 노드를 찾는 함수
  const findNodeByKey = (nodes, key) => {
    for (const node of nodes) {
      if (node.key === key) return node;
      if (node.children && node.children.length > 0) {
        const found = findNodeByKey(node.children, key);
        if (found) return found;
      }
    }
    return null;
  };

  // 체크된 노드의 키 목록을 반환하는 함수
  const getCheckedKeys = (checkStates) => {
    const checkedKeys = [];
    const collectLeafNodes = (nodeList) => {
      nodeList.forEach((node) => {
        if (checkStates[node.key] === true) {
          if (!node.children || node.children.length === 0) {
            checkedKeys.push(node.key);
          }
        }
        if (node.children && node.children.length > 0) {
          collectLeafNodes(node.children);
        }
      });
    };
    collectLeafNodes(nodes);
    return checkedKeys;
  };

  // Area 버튼의 색상을 결정하는 함수
  const getAreaButtonColor = (areaNode) => {
    const allChecked = areaNode.children.every((child) => nodeCheckStates[child.key] === true);
    const someChecked = areaNode.children.some((child) => nodeCheckStates[child.key] === true || nodeCheckStates[child.key] === null);

    if (allChecked) return 'blue';
    if (someChecked) return 'rgba(0, 0, 255, 0.2)';
    return 'grey';
  };

  // 특정 Area에 선택된 코스 정보를 반환하는 함수
  const getSelectedCourses = (areaKey) => {
    const areaNode = findNodeByKey(nodes, areaKey);
    if (!areaNode) return [];

    const selectedCourses = areaNode.children
      .filter((courseNode) =>
        courseNode.children.some((holeNode) => nodeCheckStates[holeNode.key] === true)
      )
      .map((courseNode) => {
        const allHolesChecked = courseNode.children.every((holeNode) => nodeCheckStates[holeNode.key] === true);
        return allHolesChecked ? `${courseNode.label} [전체]` : `${courseNode.label} [일부분]`;
      });

    return selectedCourses;
  };

  // 각 노드를 렌더링하는 재귀 함수
  const renderNode = (node) => {
    const isSelected = nodeCheckStates[node.key] === true;
    const isPartiallySelected = nodeCheckStates[node.key] === null;

    return (
      <div
        key={node.key}
        style={{
          margin: '4px',
          padding: '4px',
          border: '1px solid grey',
          backgroundColor: isSelected
            ? 'blue'
            : isPartiallySelected
            ? 'rgba(0, 0, 255, 0.2)'
            : 'transparent',
          color: isSelected || isPartiallySelected ? 'white' : 'black',
          display: 'inline-block',
        }}
      >
        <div onClick={() => handleCheckChange(node.key, !(nodeCheckStates[node.key] || false))}>
          {node.label}
        </div>
        {node.children && node.children.length > 0 && (
          <div style={{ display: 'inline-flex', flexWrap: 'nowrap', marginLeft: '10px' }}>
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {nodes.map((areaNode) => (
        <div key={areaNode.key} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <button
            onClick={() => handleAreaToggle(areaNode.key)}
            style={{ backgroundColor: getAreaButtonColor(areaNode), color: 'white', padding: '10px', border: 'none', borderRadius: '4px' }}
          >
            {areaNode.label}
          </button>
          {expandedArea !== areaNode.key && (
          <span style={{ marginLeft: '10px' }}>{getSelectedCourses(areaNode.key).join(', ')}</span>
          )}
          {expandedArea === areaNode.key && (
            <div style={{ marginLeft: '20px' }}>{areaNode.children.map((child) => renderNode(child))}</div>
          )}
        </div>
      ))}
    </div>
  );
};

LocationTree.propTypes = {
  dsTask: PropTypes.object.isRequired,
  initialState: PropTypes.array,
  onStateChange: PropTypes.func.isRequired,
};

LocationTree.defaultProps = {
  initialState: [],
};

export default LocationTree;

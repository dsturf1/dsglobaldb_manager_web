import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { v4 as uuidv4 } from 'uuid';
import { PlusIcon, DocumentCheckIcon } from '@heroicons/react/24/outline';

const EditableObjectList = ({ title, items, onItemsChange }) => {
  const [_items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const itemsWithId = items.map(item => ({
      id: uuidv4(),
      ...item
    }));
    setItems(itemsWithId);
  }, []);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const newItems = Array.from(_items);
    const [removed] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, removed);
    setItems(newItems);
  };

  const handleDelete = (index) => {
    const newItems = _items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleAdd = () => {
    // 기존 항목들의 키 구조를 분석
    const existingKeys = _items.length > 0 ? Object.keys(_items[0]).filter(key => key !== 'id') : [];
    
    // 새로운 항목 생성 (기존 키들을 빈 값으로 초기화)
    const newItem = {
      id: uuidv4(),
      ...Object.fromEntries(existingKeys.map(key => [key, '']))
    };
    
    const newItems = [..._items, newItem];
    setItems(newItems);
    setEditingItem(newItem);
    setIsDialogOpen(true);
  };

  const handleDoubleClick = (item) => {
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  const handleDialogSave = (updatedItem) => {
    const newItems = _items.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
    setItems(newItems);
    console.log(newItems);
    setIsDialogOpen(false);
    setEditingItem(null);
  }
    
  const handleFinalConfirm = () => {
    onItemsChange(_items);
  };

  return (
    <div className="p-4 bg-white shadow rounded relative">
      <h2 className="text-[15px] font-bold mb-2">{title}</h2>
      <div className="absolute left-32 top-4 flex gap-2">
        <button
          onClick={handleAdd}
          className="w-[100px] px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
        >
          <PlusIcon className="h-4 w-4" />
          추가
        </button>
        <button
          onClick={handleFinalConfirm}
          className="w-[100px] px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm flex items-center gap-1"
        >
          <DocumentCheckIcon className="h-4 w-4" />
          최종 확정
        </button>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="droppable" direction="horizontal">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex gap-2 overflow-x-auto p-2 border border-dashed min-h-[60px]"
            >
              {_items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`relative w-[1000px] px-4 py-2 bg-gray-700 text-white rounded text-sm ${
                        snapshot.isDragging ? 'opacity-50' : ''
                      }`}
                    >
                      <div
                        onDoubleClick={() => handleDoubleClick(item)}
                        className="text-white pt-1 text-left whitespace-pre-line"
                      >
                        {Object.entries(item)
                          .filter(([key]) => key !== 'id')
                          .map(([key, value]) => `${key}: ${value}`)
                          .join('\n')}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(index);
                        }}
                        className="absolute right-1 -translate-y-1/2 top-1/2 w-8 h-8 text-xl rounded-full text-white flex items-center justify-center hover:bg-sky-400"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {isDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-lg font-bold mb-4">항목 편집</h3>
            <div className="space-y-4">
              {Object.entries(editingItem)
                .filter(([key]) => key !== 'id')
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-24 font-medium">{key}:</span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => {
                        setEditingItem({
                          ...editingItem,
                          [key]: e.target.value
                        });
                      }}
                      className="flex-1 px-2 py-1 border rounded"
                    />
                  </div>
                ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleDialogClose}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={() => handleDialogSave(editingItem)}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditableObjectList; 
import React, { useState , useEffect} from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { v4 as uuidv4 } from 'uuid';
import { PlusIcon, DocumentCheckIcon } from '@heroicons/react/24/outline';

const EditableButtonList = ({ title, items, onItemsChange }) => {
  const [_items, setItems] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    const itemsWithId = items.map(item => ({
      id: uuidv4(),
      value: item
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
    const newItems = [..._items, { id: uuidv4(), value: '' }];
    setItems(newItems);
    setEditingIndex(newItems.length - 1);
    setEditValue('');
  };

  const handleDoubleClick = (index) => {
    setEditingIndex(index);
    setEditValue(_items[index].value);
  };

  const handleEditChange = (e) => {
    setEditValue(e.target.value);
  };

  const handleEditSubmit = (e) => {
    if (e.key === 'Enter') {
      const newItems = [..._items];
      newItems[editingIndex] = { id: uuidv4(), value: editValue };
      setEditingIndex(null);
    }
  };

  const handleBlur = () => {
    if (editValue.trim() !== '') {
      const newItems = [..._items];
      newItems[editingIndex] = { id: uuidv4(), value: editValue };
      setItems(newItems);
    }
    setEditingIndex(null);
  };

  const handleFinalConfirm = () => {
    onItemsChange(_items.map(item => item.value));
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
                      className={`relative w-[150px] px-4 py-2 bg-gray-700 text-white rounded text-center text-sm ${
                        snapshot.isDragging ? 'opacity-50' : ''
                      }`}
                    >
                      {editingIndex === index ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={handleEditChange}
                          onKeyDown={handleEditSubmit}
                          onBlur={handleBlur}
                          autoFocus
                          className="w-full px-2 py-1 rounded bg-sky-200 text-black text-center"
                        />
                      ) : (
                        <div
                          onDoubleClick={() => handleDoubleClick(index)}
                          className="text-white pt-1"
                        >
                          {item.value}
                        </div>
                      )}

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
    </div>
  );
};

export default EditableButtonList;

